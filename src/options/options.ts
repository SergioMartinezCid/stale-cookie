import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  normalizeWhitelistEntry,
  type Settings,
} from '../ext/settings';
import { requestBrowsingDataPermission, runGlobalClear } from '../ext/globalClear';
import { parseSettingsImport, serializeSettings } from '../core/settings';
import { getActionLog, type ActionLogEntry } from '../ext/actionLog';
import { getErrorLog, installErrorCapture } from '../ext/errorLog';
import { serializeLogs, type ErrorLogEntry } from '../core/logs';
import { applyTheme } from '../ui/theme';

installErrorCapture('options');
localizePage();

const msg = (key: string, subs?: string[]) => browser.i18n.getMessage(key, subs);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const cookieThreshold = el<HTMLInputElement>('cookie-threshold');
const historyThreshold = el<HTMLInputElement>('history-threshold');
const downloadThreshold = el<HTMLInputElement>('download-threshold');
const clearHistory = el<HTMLInputElement>('clear-history');
const clearDownloads = el<HTMLInputElement>('clear-downloads');
const permissionNote = el<HTMLParagraphElement>('permission-note');
const thresholdWarning = el<HTMLParagraphElement>('threshold-warning');
const keepUnknown = el<HTMLInputElement>('keep-unknown');
const autoClean = el<HTMLInputElement>('auto-clean');
const autoCleanDays = el<HTMLInputElement>('auto-clean-days');
const reminderAutoNote = el<HTMLParagraphElement>('reminder-auto-note');
const reminderDays = el<HTMLInputElement>('reminder-days');
const reminderBadge = el<HTMLInputElement>('reminder-badge');
const reminderNotification = el<HTMLInputElement>('reminder-notification');
const reminderPermissionNote = el<HTMLParagraphElement>('reminder-permission-note');
const themeSelect = el<HTMLSelectElement>('theme');
const whitelistForm = el<HTMLFormElement>('whitelist-form');
const whitelistInput = el<HTMLInputElement>('whitelist-input');
const whitelistStatus = el<HTMLParagraphElement>('whitelist-status');
const whitelistList = el<HTMLUListElement>('whitelist');
const globalCache = el<HTMLInputElement>('global-cache');
const globalFormData = el<HTMLInputElement>('global-form-data');
const globalClearButton = el<HTMLButtonElement>('global-clear');
const globalStatus = el<HTMLParagraphElement>('global-status');
const exportConfig = el<HTMLButtonElement>('export-config');
const importFile = el<HTMLInputElement>('import-file');
const configStatus = el<HTMLParagraphElement>('config-status');
const actionLogTitle = el<HTMLHeadingElement>('action-log-title');
const actionLogList = el<HTMLUListElement>('action-log');
const actionLogEmpty = el<HTMLParagraphElement>('action-log-empty');
const errorLogTitle = el<HTMLHeadingElement>('error-log-title');
const errorLogList = el<HTMLUListElement>('error-log');
const errorLogEmpty = el<HTMLParagraphElement>('error-log-empty');
const logsAnonymize = el<HTMLInputElement>('logs-anonymize');
const exportLogs = el<HTMLButtonElement>('export-logs');
const saved = el<HTMLParagraphElement>('saved');

let settings: Settings;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function flashSaved(): void {
  saved.style.visibility = 'visible';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.style.visibility = 'hidden'), 1500);
}

async function persist(): Promise<void> {
  await saveSettings(settings);
  flashSaved();
}

function renderWhitelist(): void {
  whitelistList.replaceChildren(
    ...settings.whitelist.map((domain) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = domain;
      const remove = document.createElement('button');
      remove.className = 'quiet';
      remove.textContent = msg('optionsRemove');
      remove.setAttribute('aria-label', msg('optionsRemoveLabel', [domain]));
      remove.addEventListener('click', async () => {
        settings.whitelist = settings.whitelist.filter((d) => d !== domain);
        renderWhitelist();
        await persist();
      });
      li.append(span, remove);
      return li;
    }),
  );
}

/**
 * Cookies outliving history is the one config where deleted history leaves
 * surviving cookies looking "never visited" (no visit memory is kept, by
 * decision) — warn instead of forbidding it.
 */
function updateThresholdWarning(): void {
  thresholdWarning.hidden = !(
    settings.clearHistory && settings.cookieThresholdDays > settings.historyThresholdDays
  );
}

/**
 * An invalid days value is not saved, but it isn't silently reverted either:
 * the input keeps what the user typed, marked aria-invalid, with an inline
 * explanation until corrected.
 */
function showFieldError(input: HTMLInputElement): void {
  input.setAttribute('aria-invalid', 'true');
  if (!input.parentElement?.querySelector('.field-error')) {
    const error = document.createElement('span');
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    error.textContent = msg('optionsNumberInvalid');
    input.parentElement?.append(error);
  }
}

function clearFieldError(input: HTMLInputElement): void {
  input.removeAttribute('aria-invalid');
  input.parentElement?.querySelector('.field-error')?.remove();
}

/** Parse a days input; null when out of the 1–3650 range the markup states. */
function parseDays(input: HTMLInputElement): number | null {
  const days = Number(input.value);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null;
}

function bindThreshold(input: HTMLInputElement, key: 'cookieThresholdDays' | 'historyThresholdDays' | 'downloadThresholdDays'): void {
  input.addEventListener('change', async () => {
    const days = parseDays(input);
    if (days === null) {
      showFieldError(input);
      return;
    }
    clearFieldError(input);
    settings[key] = days;
    updateThresholdWarning();
    await persist();
  });
}

bindThreshold(cookieThreshold, 'cookieThresholdDays');
bindThreshold(historyThreshold, 'historyThresholdDays');
bindThreshold(downloadThreshold, 'downloadThresholdDays');

clearHistory.addEventListener('change', async () => {
  settings.clearHistory = clearHistory.checked;
  updateThresholdWarning();
  await persist();
});

clearDownloads.addEventListener('change', async () => {
  permissionNote.hidden = true;
  if (clearDownloads.checked) {
    // Optional permission, requested only when the feature is enabled.
    const granted = await browser.permissions.request({ permissions: ['downloads'] });
    if (!granted) {
      clearDownloads.checked = false;
      permissionNote.hidden = false;
      return;
    }
  }
  settings.clearDownloads = clearDownloads.checked;
  await persist();
});

keepUnknown.addEventListener('change', async () => {
  settings.keepNeverVisited = keepUnknown.checked;
  await persist();
});

/** While auto-clean is on, the manual reminder is off — gray its controls out. */
function updateReminderEnabled(): void {
  const auto = settings.autoCleanEnabled;
  reminderDays.disabled = auto;
  reminderBadge.disabled = auto;
  reminderNotification.disabled = auto;
  reminderAutoNote.hidden = !auto;
  // And the mirror image: the interval means nothing while auto-clean is off.
  autoCleanDays.disabled = !auto;
}

autoClean.addEventListener('change', async () => {
  settings.autoCleanEnabled = autoClean.checked;
  updateReminderEnabled();
  await persist();
});

autoCleanDays.addEventListener('change', async () => {
  const days = parseDays(autoCleanDays);
  if (days === null) {
    showFieldError(autoCleanDays);
    return;
  }
  clearFieldError(autoCleanDays);
  settings.autoCleanDays = days;
  await persist();
});

reminderDays.addEventListener('change', async () => {
  const days = parseDays(reminderDays);
  if (days === null) {
    showFieldError(reminderDays);
    return;
  }
  clearFieldError(reminderDays);
  settings.reminderDays = days;
  await persist();
});

reminderBadge.addEventListener('change', async () => {
  settings.reminderBadge = reminderBadge.checked;
  await persist();
});

reminderNotification.addEventListener('change', async () => {
  reminderPermissionNote.hidden = true;
  if (reminderNotification.checked) {
    // Optional permission, requested only when the feature is enabled.
    const granted = await browser.permissions.request({ permissions: ['notifications'] });
    if (!granted) {
      reminderNotification.checked = false;
      reminderPermissionNote.hidden = false;
      return;
    }
  }
  settings.reminderNotification = reminderNotification.checked;
  await persist();
});

themeSelect.addEventListener('change', async () => {
  settings.theme = themeSelect.value === 'light' ? 'light' : 'dark';
  applyTheme(settings.theme); // this page re-themes immediately
  await persist();
});

whitelistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = normalizeWhitelistEntry(whitelistInput.value);
  if (!domain) {
    // An add that silently does nothing looks like a lost click.
    whitelistStatus.textContent = msg('optionsWhitelistInvalid');
    whitelistStatus.hidden = false;
    return;
  }
  if (settings.whitelist.includes(domain)) {
    whitelistStatus.textContent = msg('optionsWhitelistDuplicate', [domain]);
    whitelistStatus.hidden = false;
    whitelistInput.value = '';
    return;
  }
  whitelistStatus.hidden = true;
  settings.whitelist.push(domain);
  settings.whitelist.sort();
  renderWhitelist();
  await persist();
  whitelistInput.value = '';
});

whitelistInput.addEventListener('input', () => {
  whitelistStatus.hidden = true;
});

function updateGlobalClearEnabled(): void {
  globalClearButton.disabled = !globalCache.checked && !globalFormData.checked;
}

globalCache.addEventListener('change', updateGlobalClearEnabled);
globalFormData.addEventListener('change', updateGlobalClearEnabled);

globalClearButton.addEventListener('click', async () => {
  globalStatus.textContent = '';
  // Global clear bypasses the preview, so it demands an explicit modal
  // confirmation. confirm() is synchronous, which also keeps this a valid
  // user-input handler for the permission request that follows. The dialog
  // names the selected types — the checkboxes are out of sight behind it.
  const typeNames = [
    ...(globalCache.checked ? [msg('optionsGlobalCache')] : []),
    ...(globalFormData.checked ? [msg('optionsGlobalFormData')] : []),
  ].join(', ');
  if (!window.confirm(msg('optionsGlobalConfirm', [typeNames]))) return;
  const granted = await requestBrowsingDataPermission();
  if (!granted) {
    globalStatus.textContent = msg('optionsPermissionDenied');
    return;
  }
  globalClearButton.disabled = true; // a double-click must not clear twice
  globalStatus.textContent = msg('optionsGlobalRunning');
  try {
    await runGlobalClear({ cache: globalCache.checked, formData: globalFormData.checked });
    globalStatus.textContent = msg('optionsGlobalDone');
  } finally {
    updateGlobalClearEnabled();
  }
});

function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

exportConfig.addEventListener('click', () => {
  configStatus.textContent = '';
  downloadFile(
    `stale-cookie-settings-${new Date().toISOString().slice(0, 10)}.json`,
    serializeSettings(settings),
    'application/json',
  );
});

importFile.addEventListener('change', async () => {
  configStatus.textContent = '';
  const file = importFile.files?.[0];
  importFile.value = '';
  if (!file) return;
  const imported = parseSettingsImport(await file.text());
  if (!imported) {
    configStatus.textContent = msg('optionsImportInvalid');
    return;
  }
  // Importing replaces everything, including the whitelist — that deserves
  // a confirmation, not an instant apply. confirm() is fine here: this is a
  // normal tab, not a popup panel.
  if (!window.confirm(msg('optionsImportConfirm', [String(settings.whitelist.length)]))) {
    return;
  }
  // Permissions can't travel with the file — permission-gated features
  // arrive off, and re-enabling them here triggers the request.
  let downgraded = false;
  for (const [key, permission] of [
    ['clearDownloads', 'downloads'],
    ['reminderNotification', 'notifications'],
  ] as const) {
    if (imported[key] && !(await browser.permissions.contains({ permissions: [permission] }))) {
      imported[key] = false;
      downgraded = true;
    }
  }
  settings = imported;
  await saveSettings(settings);
  applySettingsToUi();
  configStatus.textContent = downgraded
    ? `${msg('optionsImportDone')} ${msg('optionsImportPermissionNote')}`
    : msg('optionsImportDone');
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function actionSummary(entry: ActionLogEntry): string {
  if (entry.type === 'global-clear') {
    const names = entry.dataTypes.map((t) =>
      t === 'cache' ? msg('optionsGlobalCache') : msg('optionsGlobalFormData'),
    );
    return msg('logGlobalClear', [names.join(', ')]);
  }
  if (entry.type === 'restore-cookies') {
    const count = entry.restored.reduce((n, r) => n + r.count, 0);
    const sites = new Set(entry.restored.map((r) => r.domain)).size;
    return msg('logRestoredCookies', [String(count), String(sites)]);
  }
  const count = entry.deleted.reduce((n, d) => n + d.count, 0);
  const sites = new Set(entry.deleted.map((d) => d.domain)).size;
  const key =
    entry.type === 'delete-cookies'
      ? 'logDeletedCookies'
      : entry.type === 'delete-history'
        ? 'logDeletedHistory'
        : 'logDeletedDownloads';
  return msg(key, [String(count), String(sites)]);
}

function logRow(at: number, text: string, stack?: string): HTMLLIElement {
  const li = document.createElement('li');
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = dateTimeFormat.format(at);
  if (stack) {
    // A title-only tooltip hides the stack from keyboard and touch.
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = text;
    const pre = document.createElement('pre');
    pre.textContent = stack;
    details.append(summary, pre);
    li.append(time, details);
  } else {
    const body = document.createElement('span');
    body.textContent = text;
    li.append(time, body);
  }
  return li;
}

/**
 * The viewer shows real site names — it's the user's own local data.
 * Anonymization applies only to the export, which is what leaves the machine.
 */
async function renderLogs(): Promise<void> {
  const [actions, errors] = await Promise.all([getActionLog(), getErrorLog()]);
  actionLogTitle.textContent = msg('optionsActionLogTitle', [String(actions.length)]);
  errorLogTitle.textContent = msg('optionsErrorLogTitle', [String(errors.length)]);
  actionLogList.replaceChildren(
    ...[...actions].reverse().map((entry) => logRow(entry.at, actionSummary(entry))),
  );
  actionLogEmpty.hidden = actions.length > 0;
  errorLogList.replaceChildren(
    ...[...errors]
      .reverse()
      .map((entry: ErrorLogEntry) =>
        logRow(entry.at, `[${entry.context}] ${entry.message}`, entry.stack),
      ),
  );
  errorLogEmpty.hidden = errors.length > 0;
}

exportLogs.addEventListener('click', async () => {
  const [actions, errors] = await Promise.all([getActionLog(), getErrorLog()]);
  downloadFile(
    `stale-cookie-logs-${new Date().toISOString().slice(0, 10)}.jsonl`,
    serializeLogs({
      actions,
      errors,
      version: browser.runtime.getManifest().version,
      exportedAt: Date.now(),
      anonymize: logsAnonymize.checked,
    }),
    'application/x-ndjson',
  );
});

function applySettingsToUi(): void {
  themeSelect.value = settings.theme;
  applyTheme(settings.theme);
  cookieThreshold.value = String(settings.cookieThresholdDays);
  historyThreshold.value = String(settings.historyThresholdDays);
  downloadThreshold.value = String(settings.downloadThresholdDays);
  clearHistory.checked = settings.clearHistory;
  clearDownloads.checked = settings.clearDownloads;
  keepUnknown.checked = settings.keepNeverVisited;
  autoClean.checked = settings.autoCleanEnabled;
  autoCleanDays.value = String(settings.autoCleanDays);
  reminderDays.value = String(settings.reminderDays);
  reminderBadge.checked = settings.reminderBadge;
  reminderNotification.checked = settings.reminderNotification;
  renderWhitelist();
  updateGlobalClearEnabled();
  updateThresholdWarning();
  updateReminderEnabled();
}

void loadSettings().then((loaded) => {
  settings = loaded;
  applySettingsToUi();
});

void renderLogs();

// The logs list was a load-time snapshot: a popup deletion, an automatic
// clean, or this page's own global clear never appeared until a manual
// reload. Both logs live in extension storage, so re-render on change.
browser.storage.onChanged.addListener((changes) => {
  if ('actionLog' in changes || 'errorLog' in changes) void renderLogs();
  // Settings can change under this page too (the popup's Protect / its
  // Undo write the whitelist). Without this refresh, the next persist()
  // here would write the stale whole-object copy back and silently drop
  // that protection — which auto-clean would then act on, previewless.
  const change = changes['settings'];
  if (change && settings) {
    const stored: Settings = { ...DEFAULT_SETTINGS, ...(change.newValue as Partial<Settings>) };
    // Own writes arrive here too — deep-equal means nothing to refresh
    // (and re-rendering would clobber in-progress input for no reason).
    if (JSON.stringify(stored) !== JSON.stringify(settings)) {
      settings = stored;
      applySettingsToUi();
    }
  }
});
