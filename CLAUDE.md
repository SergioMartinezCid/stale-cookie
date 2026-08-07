# Stale Cookie

Browser extension that clears stale browser data — data belonging to sites not visited recently — while preserving data for recently-visited sites. Firefox first, Chrome later. Currently a personal project; will be published (AMO, then Chrome Web Store).

Name availability was checked 2026-08-07: no collisions on AMO, Chrome Web Store, GitHub, or in the cookie-cleaner extension space (informal check; no formal trademark search).

## Scope

Data types targeted (eventually): cookies, browsing history, download history, form data, cache/temporary files, site settings.

Rule: **per-site deletion only where the browser APIs allow it; data types that can only be cleared globally are skipped**, not cleared globally. (Firefox's `browsingData` cannot scope cache or form data to a hostname.)

## Roadmap

- **v0.1**: manual cleaning of cookies only, with preview before deletion and a manual whitelist. Build up from there.
- **v1.0**: first published version, covering most of the decisions in this file.
- Undo (e.g. snapshotting cookies before deletion) is a secondary/later feature; preview is the required safety mechanism.

## Product decisions

- **Staleness**: configurable threshold per data type (cookies vs history vs cache have different blast radius).
- **Visit matching**: by registrable domain (eTLD+1). Visiting `mail.google.com` keeps `google.com` data fresh. A Public Suffix List must be bundled (no built-in PSL API for extensions).
- **Cleaning modes**: both automatic (scheduled) and manual are configurable. In manual mode, the extension reminds the user to clean after a configurable time has passed.
- **Preview**: cleaning always shows what will be deleted before committing (at minimum in manual mode).
- **Whitelist**: manual, explicit "never touch" list only. No auto-detection of protected sites.
- **Never-visited data** (no recorded visit at all): if the scan finds **no visit data for anything** (fresh install, wiped history), that's no signal — no-op, nothing preselected. If some sites have visits and others don't, never-visited sites are **preselected for deletion by default**; a setting flips them to never-preselected. Preselection only — the user can always override checkboxes in the preview.
- **Reminder (manual mode)**: badge on the toolbar icon by default; system notification as optional secondary (both can be enabled). The reminder timer resets on last clean; a "skip this reminder" button dismisses and resets the timer without cleaning.
- **Action log export**: JSONL or plain txt. Low priority — no major support commitment is planned for the extension.
- **Firefox containers**: handled. `containerA:example.com` and `containerB:example.com` are treated as separate entries (enumerate cookies per `storeId`/partition, never only the default store).
- **Browser profiles**: classic local profiles (about:profiles), not Firefox's newer profile-management feature. Extensions and their storage are per-profile in both Firefox and Chrome, so "current profile only" is automatic. Config is importable/exportable; sharing config across profiles happens via that export/import (no sync service — the no-network rule forbids it).
- **UI surface**: toolbar icon/popup for routine cleaning (also serves as the reminder vehicle in manual mode) + an options page for configuration.

### Scope notes

- **v1.0 scope**: everything specified in this file as of 2026-08-07, unless stated otherwise later.

## Technical decisions

- **Manifest V3**, targeting the cross-browser WebExtensions common subset. **Standing instruction: as implementation advances, flag MV3 limitations to the user as they are encountered.** The decision on whether to split into MV2 (Firefox) / MV3 (Chrome) builds stays deferred but **must be made before v1.0**.
- **Stack**: TypeScript, a light bundler, `webextension-polyfill` (promise-based `browser.*` everywhere).
- **Last-visited source**: `browser.history`, combined with the extension's own local log of actions it took (e.g. recording when the extension itself deleted history entries, so later logic can distinguish "extension-deleted" from "never visited").
- **Permissions**: permissions the core always needs are requested at install (no point deferring them); feature-specific permissions go behind optional runtime requests (`permissions.request`) when the user enables the feature.
- **Testing**: unit tests for the core logic (pure functions with mocked `browser.*` APIs) + integration tests against real seeded throwaway browser profiles. Never test deletion logic against a real profile. TDD only if explicitly requested.

### Implementation decisions (v0.1)

- **PSL/eTLD+1**: `tldts` (bundles the Public Suffix List, works offline).
- **Partitioned cookies** (CHIPS/`partitionKey`): staleness is judged by visits to the **partition top-level site**, not the cookie's own domain — the cookie is only ever sent while visiting that site. They are separate groups with a "partitioned" badge in the UI.
- **Container enumeration**: via `contextualIdentities.query()` (permission added) — `cookies.getAllCookieStores()` only lists stores with open tabs, which would miss closed containers. The private-browsing store is excluded: its cookies are session-only.
- **Cookie enumeration**: per store with `partitionKey: {}` (matches partitioned + unpartitioned) and `firstPartyDomain: null` (matches all when first-party isolation is on; needs a cast, typings only allow string).
- **Default threshold**: 90 days (conservative — deleting cookies logs people out).
- **Action log**: `storage.local`, capped at 200 entries.
- v0.1 does all work in the popup (no background messaging); acceptable while scans are fast, revisit for scheduled cleaning.

### Verified API constraints (2026-08-07)

- Neither Firefox nor Chrome exposes cookie creation/last-accessed time to extensions. `cookies.Cookie` has `expirationDate` as its only time field. Firefox tracks `lastAccessed`/`creationTime` internally (`nsICookie` / `moz_cookies`) but drops them at the WebExtensions boundary (`ext-cookies.js` `convertCookie`). Staleness must therefore be derived from history, not from the cookies themselves.
- `history.search()` defaults: `startTime` = last 24h (pass `0` to search all history), `maxResults` = 100 (raise explicitly). Results are reverse-chronological; `HistoryItem.lastVisitTime` is the key field.
- **Unit mismatch**: `cookies.Cookie.expirationDate` is in **seconds**; history API times are in **milliseconds**. Convert deliberately.
- Firefox-specific cookie fields: `firstPartyDomain`, `partitionKey` — relevant for containers and partitioned cookies.
- `history` permission is desktop-only on Firefox (not Firefox for Android).

## Privacy stance

- **No network requests, ever.** No telemetry, no analytics, no phone-home.
- Data needed for the extension to function (visit correlation, action log, config) is collected and stored **locally only** and never shared.
- Error reporting = user-facing log consultation/export + the public issue tracker. No automatic reporting.

This stance is a published commitment (privacy policy for AMO) — do not introduce anything that contradicts it.

## Project conventions

- **License**: MIT (decided before first commit).
- **Localization**: English + Spanish from the start; English is the default. All UI strings go through `i18n.getMessage()` from the first line of UI code — never hardcode user-facing strings.
- Build must be reproducible/documentable (AMO requires source submission for bundled/minified code).
