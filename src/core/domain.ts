import { getDomain } from 'tldts';

/**
 * Normalize a cookie's domain attribute to a bare hostname:
 * strips the leading dot of domain cookies (".example.com" → "example.com").
 */
export function normalizeCookieDomain(cookieDomain: string): string {
  return cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;
}

/**
 * Registrable domain (eTLD+1) of a hostname — the unit visits are matched at.
 * Uses the Public Suffix List bundled by tldts. Falls back to the hostname
 * itself when there is no registrable domain (IP addresses, localhost).
 */
export function getRegistrableDomain(hostname: string): string {
  return getDomain(hostname) ?? hostname;
}

/** Hostname of a URL, or undefined if the URL cannot be parsed. */
export function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * True for extension-page URLs (chrome-extension://, moz-extension://).
 * Their "hostname" is an extension id, not a site — Chrome records visited
 * extension pages (this extension's own popup included) in browsing history,
 * and without this check they surface in the preview as gibberish domain
 * rows. Extension schemes are the one non-web case with a hostname; other
 * non-web schemes (about:, data:, file:) have none and already fall out of
 * grouping on that, so they are left alone for now.
 */
export function isExtensionUrl(url: string): boolean {
  return /^(?:chrome|moz)-extension:/i.test(url);
}
