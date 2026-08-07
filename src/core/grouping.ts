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
