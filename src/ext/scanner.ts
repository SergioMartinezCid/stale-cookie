import browser from 'webextension-polyfill';
import { getRegistrableDomain, hostnameOf } from '../core/domain';
import { groupCookies } from '../core/grouping';
import { classifyGroups, type ClassifiedGroup } from '../core/classify';
import { cookieRemovalDetails } from '../core/removal';
import { appendActionLog } from './actionLog';
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

/**
 * Most recent visit to any URL of the given registrable domain, in ms since
 * epoch. history.search matches `text` as a substring of URL/title, so hits
 * are validated by comparing eTLD+1 of the result URL; results come newest
 * first, so the first validated hit is the answer.
 */
async function lastVisitForDomain(domain: string): Promise<number | undefined> {
  const items = await browser.history.search({
    text: domain,
    startTime: 0, // default is "last 24h" — must be explicit
    maxResults: 1000,
  });
  for (const item of items) {
    if (!item.url || item.lastVisitTime === undefined) continue;
    const host = hostnameOf(item.url);
    if (host && getRegistrableDomain(host) === domain) return item.lastVisitTime;
  }
  return undefined;
}

export async function scanCookies(settings: Settings): Promise<ScanOutcome> {
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

  const groups = groupCookies(cookies);
  const visitDomains = [...new Set(groups.map((g) => g.visitDomain))];
  const lastVisitByDomain = new Map<string, number>();
  await Promise.all(
    visitDomains.map(async (domain) => {
      const lastVisit = await lastVisitForDomain(domain);
      if (lastVisit !== undefined) lastVisitByDomain.set(domain, lastVisit);
    }),
  );

  const classified = classifyGroups(groups, lastVisitByDomain, {
    now: Date.now(),
    thresholdMs: settings.cookieThresholdDays * DAY_MS,
    whitelist: settings.whitelist,
  });

  return { groups: classified, containerNames, scannedAt: Date.now() };
}

/** Delete every cookie of the given groups. Returns the number removed. */
export async function deleteCookieGroups(groups: readonly ClassifiedGroup[]): Promise<number> {
  let removed = 0;
  const logDetails: Array<{ domain: string; storeId: string; count: number }> = [];
  for (const group of groups) {
    let groupRemoved = 0;
    for (const cookie of group.cookies) {
      const result = await browser.cookies.remove(cookieRemovalDetails(cookie));
      if (result) groupRemoved++;
    }
    removed += groupRemoved;
    logDetails.push({ domain: group.registrableDomain, storeId: group.storeId, count: groupRemoved });
  }
  await appendActionLog({ at: Date.now(), type: 'delete-cookies', deleted: logDetails });
  return removed;
}
