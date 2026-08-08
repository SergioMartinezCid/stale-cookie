import browser from 'webextension-polyfill';
import type { Cookies } from 'webextension-polyfill';
import { cookieRestoreDetails, type RestorableCookie } from '../core/restore';
import { getRegistrableDomain, normalizeCookieDomain } from '../core/domain';
import { appendActionLog } from './actionLog';

/**
 * Undo snapshot: the cookies of the most recent deletion (manual or
 * automatic — both go through deleteGroups). Deliberately in
 * storage.session: deleted cookie values are credentials, so the snapshot
 * lives in memory only and vanishes when the browser closes. Single level —
 * each deletion replaces the previous snapshot. Cookies only: history undo
 * would mean retaining visit data after deletion (rejected with "visit
 * memory"), and download entries cannot be re-created via the API.
 */
const KEY = 'undoSnapshot';

/**
 * Undo window: 24 h from the deletion, checked when the snapshot is read —
 * the effective bound is min(24 h, browser session). Long enough to notice
 * an unattended auto-clean deleted the wrong thing, short enough not to
 * hold credential-bearing cookie values for a week-long browser session.
 */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export interface UndoSnapshot {
  at: number;
  cookies: RestorableCookie[];
}

export async function saveSnapshot(cookies: readonly RestorableCookie[]): Promise<void> {
  // A deletion with no cookies keeps the previous snapshot alive instead of
  // clobbering it with nothing to undo.
  if (cookies.length === 0) return;
  const snapshot: UndoSnapshot = { at: Date.now(), cookies: [...cookies] };
  try {
    await browser.storage.session.set({ [KEY]: snapshot });
  } catch {
    // No snapshot just means no undo — never block the deletion itself.
  }
}

export async function getSnapshot(): Promise<UndoSnapshot | undefined> {
  try {
    const stored = await browser.storage.session.get(KEY);
    const snapshot = stored[KEY] as UndoSnapshot | undefined;
    if (!snapshot) return undefined;
    if (Date.now() - snapshot.at > SNAPSHOT_TTL_MS) {
      await clearSnapshot();
      return undefined;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await browser.storage.session.remove(KEY);
  } catch {
    // Already gone at the latest when the browser closes.
  }
}

/**
 * Re-create the snapshotted cookies. Returns how many were restored;
 * cookies that expired since the snapshot are skipped, and one failing
 * cookie never aborts the rest. The snapshot is consumed either way.
 */
export async function restoreSnapshot(): Promise<number> {
  const snapshot = await getSnapshot();
  if (!snapshot) return 0;

  const nowSeconds = Date.now() / 1000;
  const restoredBy = new Map<string, { domain: string; storeId: string; count: number }>();
  let restored = 0;

  for (const cookie of snapshot.cookies) {
    const details = cookieRestoreDetails(cookie, nowSeconds);
    if (details === undefined) continue;
    try {
      await browser.cookies.set(details as Cookies.SetDetailsType);
      restored++;
      const domain = getRegistrableDomain(normalizeCookieDomain(cookie.domain));
      const key = `${cookie.storeId}|${domain}`;
      const entry = restoredBy.get(key) ?? { domain, storeId: cookie.storeId, count: 0 };
      entry.count++;
      restoredBy.set(key, entry);
    } catch {
      // e.g. a container that no longer exists — restore what we can.
    }
  }

  await clearSnapshot();
  if (restored > 0) {
    await appendActionLog({
      at: Date.now(),
      type: 'restore-cookies',
      restored: [...restoredBy.values()],
    });
  }
  return restored;
}
