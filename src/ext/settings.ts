import browser from 'webextension-polyfill';
import { getRegistrableDomain, hostnameOf } from '../core/domain';

export interface Settings {
  /** Days without a visit after which a site's cookies count as stale. */
  cookieThresholdDays: number;
  /** Days without a visit after which a site's history counts as stale. */
  historyThresholdDays: number;
  /** Days without a visit after which a site's downloads count as stale. */
  downloadThresholdDays: number;
  /** Include browsing history in scans (uses the install-time history permission). */
  clearHistory: boolean;
  /** Include download history in scans (needs the optional "downloads" permission). */
  clearDownloads: boolean;
  /** Protected registrable domains — never deleted. */
  whitelist: string[];
  /** Never preselect never-visited sites for deletion. */
  keepNeverVisited: boolean;
  /** Clean automatically on a schedule (background, no preview). */
  autoCleanEnabled: boolean;
  /** Days between automatic cleans. */
  autoCleanDays: number;
  /** Days after the last clean (or skip) before the reminder fires. */
  reminderDays: number;
  /** Reminder vehicle: badge on the toolbar icon (default). */
  reminderBadge: boolean;
  /** Reminder vehicle: system notification (needs the optional "notifications" permission). */
  reminderNotification: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cookieThresholdDays: 90,
  // History is the user's own archive — a deleted entry is gone for good,
  // so its default blast radius is kept smaller than cookies'.
  historyThresholdDays: 180,
  downloadThresholdDays: 90,
  clearHistory: true,
  clearDownloads: false,
  whitelist: [],
  keepNeverVisited: false,
  autoCleanEnabled: false,
  autoCleanDays: 7,
  reminderDays: 30,
  reminderBadge: true,
  reminderNotification: false,
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
