import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import {
  loadSettings,
  saveSettings,
  normalizeWhitelistEntry,
  type Settings,
} from '../ext/settings';
import { requestBrowsingDataPermission, runGlobalClear } from '../ext/globalClear';

localizePage();

const msg = (key: string) => browser.i18n.getMessage(key);
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

void loadSettings().then((loaded) => {
  settings = loaded;
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
});
