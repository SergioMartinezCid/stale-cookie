/**
 * Pure staleness logic. No browser APIs here — everything in src/core must be
 * unit-testable without a browser.
 *
 * Time units: all timestamps in this module are milliseconds since the UNIX
 * epoch (matching the history API). Note that cookies.Cookie.expirationDate
 * is in SECONDS — convert at the boundary, never inside core logic.
 */

export type StalenessVerdict = 'fresh' | 'stale' | 'unknown';

/**
 * Classify a site by its last visit time.
 *
 * `unknown` (no recorded visit at all) is deliberately a separate verdict:
 * the policy for pre-install cookies and never-visited third-party domains
 * is still an open question (see CLAUDE.md), so callers must decide what to
 * do with it explicitly instead of it collapsing into `stale`.
 */
export function classifyLastVisit(
  lastVisitTime: number | undefined,
  now: number,
  thresholdMs: number,
): StalenessVerdict {
  if (lastVisitTime === undefined) return 'unknown';
  return now - lastVisitTime > thresholdMs ? 'stale' : 'fresh';
}

/**
 * Normalize a cookie's domain attribute to a bare hostname:
 * strips the leading dot of domain cookies (".example.com" → "example.com").
 */
export function normalizeCookieDomain(cookieDomain: string): string {
  return cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;
}

/**
 * Registrable domain (eTLD+1) of a hostname — the unit visits are matched at.
 *
 * TODO: this must use the Public Suffix List (bundled — extensions have no
 * built-in PSL API). The naive last-two-labels fallback below is WRONG for
 * multi-label suffixes like `co.uk` and must be replaced before any deletion
 * logic ships.
 */
export function getRegistrableDomain(hostname: string): string {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}
