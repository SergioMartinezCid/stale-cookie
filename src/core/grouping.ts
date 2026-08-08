import { getRegistrableDomain, hostnameOf, normalizeCookieDomain } from './domain';

/**
 * Structural subset of cookies.Cookie that the core logic needs — keeps this
 * module free of browser types. `partitionKey`/`firstPartyDomain` are
 * Firefox-specific (partitioned cookies / first-party isolation).
 */
export interface ScannableCookie {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  storeId: string;
  firstPartyDomain?: string;
  partitionKey?: { topLevelSite?: string };
}

export interface CookieGroup {
  kind: 'cookies';
  /** Unique key: storeId | firstPartyDomain | partition site | eTLD+1. */
  key: string;
  /** eTLD+1 the cookies belong to — what the user sees. */
  registrableDomain: string;
  /**
   * eTLD+1 whose visits decide staleness. Equals registrableDomain except for
   * partitioned cookies, which are judged by the top-level site they are
   * partitioned under: that is the site the user actually visits for the
   * cookie to be used.
   */
  visitDomain: string;
  storeId: string;
  partitionSite?: string;
  firstPartyDomain?: string;
  cookies: ScannableCookie[];
}

/** Structural subset of history.HistoryItem the core logic needs. */
export interface ScannableHistoryItem {
  url?: string;
  lastVisitTime?: number;
}

export interface HistoryGroup {
  kind: 'history';
  key: string;
  registrableDomain: string;
  visitDomain: string;
  urls: string[];
  /** Most recent visit to any URL in the group, ms since epoch. */
  lastVisitTime: number;
}

/** Structural subset of downloads.DownloadItem the core logic needs. */
export interface ScannableDownload {
  id: number;
  url?: string;
  /** ISO 8601, as the downloads API reports it. */
  startTime?: string;
}

export interface DownloadGroup {
  kind: 'downloads';
  key: string;
  registrableDomain: string;
  visitDomain: string;
  downloadIds: number[];
  /** Most recent download start in the group, ms since epoch. */
  latestTime?: number;
}

export type SiteGroup = CookieGroup | HistoryGroup | DownloadGroup;

/**
 * Group cookies by (cookie store, first-party domain, partition, eTLD+1).
 * Same domain in two containers is deliberately two separate groups.
 */
export function groupCookies(cookies: readonly ScannableCookie[]): CookieGroup[] {
  const map = new Map<string, CookieGroup>();
  for (const cookie of cookies) {
    const registrableDomain = getRegistrableDomain(normalizeCookieDomain(cookie.domain));
    const partitionSite = cookie.partitionKey?.topLevelSite;
    const firstPartyDomain = cookie.firstPartyDomain || undefined;
    const key = `${cookie.storeId}|${firstPartyDomain ?? ''}|${partitionSite ?? ''}|${registrableDomain}`;

    let group = map.get(key);
    if (!group) {
      const partitionHost = partitionSite ? hostnameOf(partitionSite) : undefined;
      group = {
        kind: 'cookies',
        key,
        registrableDomain,
        visitDomain: partitionHost ? getRegistrableDomain(partitionHost) : registrableDomain,
        storeId: cookie.storeId,
        partitionSite,
        firstPartyDomain,
        cookies: [],
      };
      map.set(key, group);
    }
    group.cookies.push(cookie);
  }
  return [...map.values()];
}

/**
 * Group history items (one per URL) by eTLD+1. Items without a URL or a
 * visit time carry no signal and are skipped.
 */
export function groupHistory(items: readonly ScannableHistoryItem[]): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>();
  for (const item of items) {
    if (!item.url || item.lastVisitTime === undefined) continue;
    const host = hostnameOf(item.url);
    if (!host) continue;
    const domain = getRegistrableDomain(host);
    let group = map.get(domain);
    if (!group) {
      group = {
        kind: 'history',
        key: `history|${domain}`,
        registrableDomain: domain,
        visitDomain: domain,
        urls: [],
        lastVisitTime: 0,
      };
      map.set(domain, group);
    }
    group.urls.push(item.url);
    group.lastVisitTime = Math.max(group.lastVisitTime, item.lastVisitTime);
  }
  return [...map.values()];
}

/** Group download history items by the eTLD+1 of the download URL. */
export function groupDownloads(downloads: readonly ScannableDownload[]): DownloadGroup[] {
  const map = new Map<string, DownloadGroup>();
  for (const download of downloads) {
    if (!download.url) continue;
    const host = hostnameOf(download.url);
    if (!host) continue;
    const domain = getRegistrableDomain(host);
    let group = map.get(domain);
    if (!group) {
      group = {
        kind: 'downloads',
        key: `downloads|${domain}`,
        registrableDomain: domain,
        visitDomain: domain,
        downloadIds: [],
      };
      map.set(domain, group);
    }
    group.downloadIds.push(download.id);
    const started = download.startTime ? Date.parse(download.startTime) : NaN;
    if (!Number.isNaN(started)) {
      group.latestTime = Math.max(group.latestTime ?? 0, started);
    }
  }
  return [...map.values()];
}
