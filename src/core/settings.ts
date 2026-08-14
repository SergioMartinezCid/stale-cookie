import { getRegistrableDomain, hostnameOf } from './domain';

export type Theme = 'dark' | 'light';

export interface Settings {
  /** Color scheme of the popup and options pages (independent of the browser theme). */
  theme: Theme;
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
  theme: 'dark',
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

/**
 * Config import/export: settings travel between profiles as a JSON file
 * (there is no sync — the no-network rule forbids it). The envelope is
 * versioned so future format changes can migrate old exports.
 */
const EXPORT_VERSION = 1;

const DAY_KEYS = [
  'cookieThresholdDays',
  'historyThresholdDays',
  'downloadThresholdDays',
  'autoCleanDays',
  'reminderDays',
] as const;

const FLAG_KEYS = [
  'clearHistory',
  'clearDownloads',
  'keepNeverVisited',
  'autoCleanEnabled',
  'reminderBadge',
  'reminderNotification',
] as const;

/** Matches the day inputs on the options page. */
const MAX_DAYS = 3650;

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ version: EXPORT_VERSION, settings }, null, 2);
}

/**
 * Parse an exported settings file. Returns undefined when the file is not a
 * settings export at all; individual fields are tolerant — an invalid or
 * unknown field falls back to its default instead of failing the import,
 * and whitelist entries are re-normalized to registrable domains.
 */
export function parseSettingsImport(text: string): Settings | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const envelope = data as Record<string, unknown>;
  const raw = envelope['settings'];
  if (envelope['version'] !== EXPORT_VERSION || typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const fields = raw as Record<string, unknown>;

  const result: Settings = { ...DEFAULT_SETTINGS, whitelist: [] };
  for (const key of DAY_KEYS) {
    const value = fields[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_DAYS) {
      result[key] = value;
    }
  }
  for (const key of FLAG_KEYS) {
    const value = fields[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  if (fields['theme'] === 'dark' || fields['theme'] === 'light') {
    result.theme = fields['theme'];
  }
  if (Array.isArray(fields['whitelist'])) {
    const domains = fields['whitelist']
      .filter((entry): entry is string => typeof entry === 'string')
      .map(normalizeWhitelistEntry)
      .filter((entry): entry is string => entry !== undefined);
    result.whitelist = [...new Set(domains)].sort();
  }
  return result;
}
