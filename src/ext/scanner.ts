import browser from 'webextension-polyfill';
import {
  groupCookies,
  groupDownloads,
  groupHistory,
  type ScannableHistoryItem,
} from '../core/grouping';
import { classifyGroups, type ClassifiedGroup } from '../core/classify';
import { cookieRemovalDetails } from '../core/removal';
import { appendActionLog } from './actionLog';
import { saveSnapshot } from './snapshot';
import type { Settings } from './settings';

export interface ScanOutcome {
  groups: ClassifiedGroup[];
  /** cookieStoreId → container name, for display. Default store not included. */
  containerNames: Record<string, string>;
  scannedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cookie stores to scan: every container (contextualIdentities — containers
 * without open tabs are missed by getAllCookieStores) plus whatever stores
 * are currently open. Private-browsing cookies are session-only and out of
 * scope, so the private store is excluded.
 */
async function listCookieStores(): Promise<{ storeIds: string[]; containerNames: Record<string, string> }> {
  const storeIds = new Set<string>();
  const containerNames: Record<string, string> = {};
  for (const store of await browser.cookies.getAllCookieStores()) {
    storeIds.add(store.id);
  }
  try {
    // Firefox-only; throws/undefined on Chrome or with containers disabled.
    for (const identity of await browser.contextualIdentities.query({})) {
      storeIds.add(identity.cookieStoreId);
      containerNames[identity.cookieStoreId] = identity.name;
    }
  } catch {
    // No container support — the open stores are all there is.
  }
  storeIds.delete('firefox-private');
  return { storeIds: [...storeIds], containerNames };
}

const HISTORY_PAGE = 5000;
const HISTORY_MAX_PAGES = 40;

/**
 * Enumerate the whole history (one item per URL, newest first), paging with
 * endTime so large histories are not truncated by maxResults. Items are
 * deduplicated by URL keeping the most recent visit — pages overlap at the
 * boundary because endTime pins to the previous page's oldest visit time.
 */
async function fetchAllHistory(): Promise<ScannableHistoryItem[]> {
  const byUrl = new Map<string, ScannableHistoryItem>();
  let endTime: number | undefined;
  for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
    const items = await browser.history.search({
      text: '',
      startTime: 0, // default is "last 24h" — must be explicit
      maxResults: HISTORY_PAGE,
      ...(endTime !== undefined ? { endTime } : {}),
    });
    if (items.length === 0) break;
    let oldest = Infinity;
    for (const item of items) {
      if (item.lastVisitTime === undefined) continue;
      oldest = Math.min(oldest, item.lastVisitTime);
      if (!item.url) continue;
      const seen = byUrl.get(item.url);
      if (!seen || (seen.lastVisitTime ?? 0) < item.lastVisitTime) {
        byUrl.set(item.url, { url: item.url, lastVisitTime: item.lastVisitTime });
      }
    }
    if (items.length < HISTORY_PAGE || !Number.isFinite(oldest)) break;
    if (endTime !== undefined && oldest >= endTime) break; // no progress — stop
    endTime = oldest;
  }
  return [...byUrl.values()];
}

async function hasPermission(permission: string): Promise<boolean> {
  try {
    return await browser.permissions.contains({ permissions: [permission] });
  } catch {
    return false;
  }
}

export async function scan(settings: Settings): Promise<ScanOutcome> {
  const now = Date.now();
  const whitelist = settings.whitelist;

  // One history enumeration serves everything: last-visit times for
  // staleness of every data type, plus the per-site history groups.
  const historyItems = await fetchAllHistory();
  const historyGroups = groupHistory(historyItems);
  const lastVisitByDomain = new Map<string, number>(
    historyGroups.map((group) => [group.registrableDomain, group.lastVisitTime]),
  );

  const { storeIds, containerNames } = await listCookieStores();
  const cookies = [];
  for (const storeId of storeIds) {
    cookies.push(
      ...(await browser.cookies.getAll({
        storeId,
        // {} matches partitioned and unpartitioned cookies alike.
        partitionKey: {},
        // null matches any first-party domain (relevant when FPI is on);
        // the typings only allow string, hence the cast.
        firstPartyDomain: null as unknown as string,
      })),
    );
  }

  const groups: ClassifiedGroup[] = classifyGroups(groupCookies(cookies), lastVisitByDomain, {
    now,
    thresholdMs: settings.cookieThresholdDays * DAY_MS,
    whitelist,
  });

  if (settings.clearHistory) {
    groups.push(
      ...classifyGroups(historyGroups, lastVisitByDomain, {
        now,
        thresholdMs: settings.historyThresholdDays * DAY_MS,
        whitelist,
      }),
    );
  }

  if (settings.clearDownloads && (await hasPermission('downloads'))) {
    const downloadGroups = groupDownloads(await browser.downloads.search({}));
    // A download is itself a usage signal for its group: a domain that only
    // ever served a download shouldn't look "never visited".
    const downloadVisits = new Map(lastVisitByDomain);
    for (const group of downloadGroups) {
      if (group.latestTime === undefined) continue;
      const known = downloadVisits.get(group.visitDomain);
      if (known === undefined || known < group.latestTime) {
        downloadVisits.set(group.visitDomain, group.latestTime);
      }
    }
    groups.push(
      ...classifyGroups(downloadGroups, downloadVisits, {
        now,
        thresholdMs: settings.downloadThresholdDays * DAY_MS,
        whitelist,
      }),
    );
  }

  return { groups, containerNames, scannedAt: now };
}

/** Delete every item of the given groups. Returns the number removed. */
export async function deleteGroups(groups: readonly ClassifiedGroup[]): Promise<number> {
  let removed = 0;

  // Undo snapshot, taken before anything is removed. The group objects hold
  // full cookies.getAll() results at runtime, so every field needed to
  // re-create them travels along.
  await saveSnapshot(groups.filter((g) => g.kind === 'cookies').flatMap((g) => g.cookies));

  const cookieLog: Array<{ domain: string; storeId: string; count: number }> = [];
  const historyLog: Array<{ domain: string; count: number }> = [];
  const downloadLog: Array<{ domain: string; count: number }> = [];

  for (const group of groups) {
    if (group.kind === 'cookies') {
      let count = 0;
      for (const cookie of group.cookies) {
        const result = await browser.cookies.remove(cookieRemovalDetails(cookie));
        if (result) count++;
      }
      removed += count;
      cookieLog.push({ domain: group.registrableDomain, storeId: group.storeId, count });
    } else if (group.kind === 'history') {
      for (const url of group.urls) {
        await browser.history.deleteUrl({ url });
      }
      removed += group.urls.length;
      historyLog.push({ domain: group.registrableDomain, count: group.urls.length });
    } else {
      let count = 0;
      for (const id of group.downloadIds) {
        const erased = await browser.downloads.erase({ id });
        count += erased.length;
      }
      removed += count;
      downloadLog.push({ domain: group.registrableDomain, count });
    }
  }

  const at = Date.now();
  if (cookieLog.length) await appendActionLog({ at, type: 'delete-cookies', deleted: cookieLog });
  if (historyLog.length) await appendActionLog({ at, type: 'delete-history', deleted: historyLog });
  if (downloadLog.length) {
    await appendActionLog({ at, type: 'delete-downloads', deleted: downloadLog });
  }
  return removed;
}
