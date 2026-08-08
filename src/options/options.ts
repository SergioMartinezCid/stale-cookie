import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import {
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
const whitelistForm = el<HTMLFormElement>('whitelist-form');
const whitelistInput = el<HTMLInputElement>('whitelist-input');
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
      remove.textContent = msg('optionsRemove');
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

function bindThreshold(input: HTMLInputElement, key: 'cookieThresholdDays' | 'historyThresholdDays' | 'downloadThresholdDays'): void {
  input.addEventListener('change', async () => {
    const days = Number(input.value);
    if (Number.isInteger(days) && days >= 1) {
      settings[key] = days;
      updateThresholdWarning();
      await persist();
    } else {
      input.value = String(settings[key]);
    }
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
}

autoClean.addEventListener('change', async () => {
  settings.autoCleanEnabled = autoClean.checked;
  updateReminderEnabled();
  await persist();
});

autoCleanDays.addEventListener('change', async () => {
  const days = Number(autoCleanDays.value);
  if (Number.isInteger(days) && days >= 1) {
    settings.autoCleanDays = days;
    await persist();
  } else {
    autoCleanDays.value = String(settings.autoCleanDays);
  }
});

reminderDays.addEventListener('change', async () => {
  const days = Number(reminderDays.value);
  if (Number.isInteger(days) && days >= 1) {
    settings.reminderDays = days;
    await persist();
  } else {
    reminderDays.value = String(settings.reminderDays);
  }
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

whitelistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = normalizeWhitelistEntry(whitelistInput.value);
  if (!domain) return;
  if (!settings.whitelist.includes(domain)) {
    settings.whitelist.push(domain);
    settings.whitelist.sort();
    renderWhitelist();
    await persist();
  }
  whitelistInput.value = '';
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
  // user-input handler for the permission request that follows.
  if (!window.confirm(msg('optionsGlobalConfirm'))) return;
  const granted = await requestBrowsingDataPermission();
  if (!granted) {
    globalStatus.textContent = msg('optionsPermissionDenied');
    return;
  }
  await runGlobalClear({ cache: globalCache.checked, formData: globalFormData.checked });
  globalStatus.textContent = msg('optionsGlobalDone');
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

function logRow(at: number, text: string, tooltip?: string): HTMLLIElement {
  const li = document.createElement('li');
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = dateTimeFormat.format(at);
  const body = document.createElement('span');
  body.textContent = text;
  if (tooltip) body.title = tooltip;
  li.append(time, body);
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
