import { normalizeCookieDomain } from './domain';
import type { ScannableCookie } from './grouping';

/**
 * A cookie as captured for the undo snapshot: the scan subset plus the
 * fields cookies.set() needs to re-create it. The extras are optional
 * because ScannableCookie is structural — at runtime the snapshot always
 * holds full cookies.getAll() objects, but restore stays defensive.
 */
export interface RestorableCookie extends ScannableCookie {
  value?: string;
  httpOnly?: boolean;
  sameSite?: string;
  /** Seconds since epoch (cookies API unit), absent for session cookies. */
  expirationDate?: number;
  session?: boolean;
  hostOnly?: boolean;
}

/** Argument object for cookies.set(). */
export interface CookieRestoreDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
  storeId: string;
  firstPartyDomain?: string;
  partitionKey?: { topLevelSite?: string };
}

/**
 * Build the cookies.set() call that re-creates a snapshotted cookie, or
 * undefined if the cookie has expired since the snapshot was taken (setting
 * it would be an immediate no-op). `nowSeconds` is in the cookies API's
 * unit — seconds, not the milliseconds the history API uses.
 */
export function cookieRestoreDetails(
  cookie: RestorableCookie,
  nowSeconds: number,
): CookieRestoreDetails | undefined {
  const session = cookie.session ?? cookie.expirationDate === undefined;
  if (!session && cookie.expirationDate !== undefined && cookie.expirationDate <= nowSeconds) {
    return undefined;
  }

  // Same URL reconstruction as removal: the scheme must be https for
  // Secure cookies.
  const host = normalizeCookieDomain(cookie.domain);
  const details: CookieRestoreDetails = {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path}`,
    name: cookie.name,
    value: cookie.value ?? '',
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly ?? false,
    storeId: cookie.storeId,
  };

  // Omitting `domain` makes the cookie host-only; a leading dot marks a
  // domain cookie when the snapshot lacks the hostOnly flag.
  const hostOnly = cookie.hostOnly ?? !cookie.domain.startsWith('.');
  if (!hostOnly) details.domain = cookie.domain;

  if (cookie.sameSite !== undefined) details.sameSite = cookie.sameSite;
  if (!session && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  if (cookie.firstPartyDomain !== undefined) details.firstPartyDomain = cookie.firstPartyDomain;
  if (cookie.partitionKey !== undefined) details.partitionKey = cookie.partitionKey;

  return details;
}
