import browser from 'webextension-polyfill';
import type { ScanOutcome } from './scanner';

/**
 * The popup's last preview, cached so the click outside the popup that
 * tears the page down doesn't throw the scan away. Deliberately in
 * storage.session: the outcome holds history URLs and cookie metadata, and
 * persisting those to disk would outlive a history deletion — the rejected
 * "visit memory". The cache vanishes with the browser session at the latest.
 */
const KEY = 'scanCache';

/**
 * How long a cached preview stays trustworthy. The world moves on after a
 * scan (sites get re-visited, cookies change), and deleting from an old
 * preview gets worse with age — so a click-away is forgiven for minutes,
 * not hours.
 */
export const SCAN_CACHE_TTL_MS = 15 * 60 * 1000;

export interface ScanCache {
  outcome: ScanOutcome;
  /** The user's explicit checkbox choices, by row domain. */
  overrides: Record<string, boolean>;
}

export async function saveScanCache(cache: ScanCache): Promise<void> {
  try {
    await browser.storage.session.set({ [KEY]: cache });
  } catch {
    // Best effort — losing the cache only means the next popup rescans.
  }
}

/** The cached preview, or undefined when there is none or it expired. */
export async function getScanCache(): Promise<ScanCache | undefined> {
  try {
    const stored = await browser.storage.session.get(KEY);
    const cache = stored[KEY] as ScanCache | undefined;
    if (!cache) return undefined;
    if (Date.now() - cache.outcome.scannedAt > SCAN_CACHE_TTL_MS) {
      await clearScanCache();
      return undefined;
    }
    return cache;
  } catch {
    return undefined;
  }
}

export async function clearScanCache(): Promise<void> {
  try {
    await browser.storage.session.remove(KEY);
  } catch {
    // Gone at the latest when the browser closes.
  }
}
