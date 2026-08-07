import { normalizeCookieDomain } from './domain';
import type { ScannableCookie } from './grouping';

/** Argument object for cookies.remove(). */
export interface CookieRemovalDetails {
  url: string;
  name: string;
  storeId: string;
  firstPartyDomain?: string;
  partitionKey?: { topLevelSite?: string };
}

/**
 * cookies.remove() identifies a cookie by URL + name (+ store, first-party
 * domain and partition). The URL is reconstructed from the cookie's own
 * attributes; the scheme must be https for Secure cookies.
 */
export function cookieRemovalDetails(cookie: ScannableCookie): CookieRemovalDetails {
  const host = normalizeCookieDomain(cookie.domain);
  const details: CookieRemovalDetails = {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path}`,
    name: cookie.name,
    storeId: cookie.storeId,
  };
  if (cookie.firstPartyDomain !== undefined) {
    details.firstPartyDomain = cookie.firstPartyDomain;
  }
  if (cookie.partitionKey !== undefined) {
    details.partitionKey = cookie.partitionKey;
  }
  return details;
}
