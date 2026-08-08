import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';

export { DEFAULT_SETTINGS, normalizeWhitelistEntry } from '../core/settings';
export type { Settings } from '../core/settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function addToWhitelist(domain: string): Promise<Settings> {
  const settings = await loadSettings();
  if (!settings.whitelist.includes(domain)) {
    settings.whitelist.push(domain);
    settings.whitelist.sort();
    await saveSettings(settings);
  }
  return settings;
}
