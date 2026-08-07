import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import {
  loadSettings,
  saveSettings,
  normalizeWhitelistEntry,
  type Settings,
} from '../ext/settings';

localizePage();

const msg = (key: string) => browser.i18n.getMessage(key);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const threshold = el<HTMLInputElement>('threshold');
const keepUnknown = el<HTMLInputElement>('keep-unknown');
const whitelistForm = el<HTMLFormElement>('whitelist-form');
const whitelistInput = el<HTMLInputElement>('whitelist-input');
const whitelistList = el<HTMLUListElement>('whitelist');
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

threshold.addEventListener('change', async () => {
  const days = Number(threshold.value);
  if (Number.isInteger(days) && days >= 1) {
    settings.cookieThresholdDays = days;
    await persist();
  } else {
    threshold.value = String(settings.cookieThresholdDays);
  }
});

keepUnknown.addEventListener('change', async () => {
  settings.keepNeverVisited = keepUnknown.checked;
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

void loadSettings().then((loaded) => {
  settings = loaded;
  threshold.value = String(settings.cookieThresholdDays);
  keepUnknown.checked = settings.keepNeverVisited;
  renderWhitelist();
});
