import browser from 'webextension-polyfill';
import { getRegistrableDomain, hostnameOf } from '../core/domain';

export interface Settings {
  /** Days without a visit after which a site's cookies count as stale. */
  cookieThresholdDays: number;
  /** Protected registrable domains — never deleted. */
  whitelist: string[];
  /** Never preselect never-visited sites for deletion. */
  keepNeverVisited: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cookieThresholdDays: 90,
  whitelist: [],
  keepNeverVisited: false,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

/**
 * Normalize user input ("https://mail.google.com/x", ".google.com") to the
 * registrable domain stored in the whitelist. Returns undefined for input
 * that yields nothing usable.
 */
export function normalizeWhitelistEntry(input: string): string | undefined {
  const trimmed = input.trim().toLowerCase().replace(/^\./, '');
  if (!trimmed) return undefined;
  const host = trimmed.includes('/') ? hostnameOf(trimmed) ?? hostnameOf(`https://${trimmed}`) : trimmed;
  if (!host) return undefined;
  return getRegistrableDomain(host);
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
