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
- **Firefox containers**: handled. `containerA:example.com` and `containerB:example.com` are treated as separate entries (enumerate cookies per `storeId`/partition, never only the default store).
- **Browser profiles**: only handle data of the current profile. Config is importable/exportable; per-profile config with optional sharing of the same config across profiles is desired but **to be refined**.
- **UI surface**: toolbar icon/popup for routine cleaning (also serves as the reminder vehicle in manual mode) + an options page for configuration.

### Open questions

- What to do with data that has no recorded visit at all (pre-install cookies, third-party cookies of never-visited sites): **to be decided**. "Unknown" is ambiguous between stale and important.
- Exact model for per-profile config sharing.

## Technical decisions

- **Manifest V3**, targeting the cross-browser WebExtensions common subset. **Standing instruction: as implementation advances, flag MV3 limitations to the user as they are encountered**, so they can decide whether splitting into MV2 (Firefox) / MV3 (Chrome) builds makes sense.
- **Stack**: TypeScript, a light bundler, `webextension-polyfill` (promise-based `browser.*` everywhere).
- **Last-visited source**: `browser.history`, combined with the extension's own local log of actions it took (e.g. recording when the extension itself deleted history entries, so later logic can distinguish "extension-deleted" from "never visited").
- **Permissions**: permissions the core always needs are requested at install (no point deferring them); feature-specific permissions go behind optional runtime requests (`permissions.request`) when the user enables the feature.
- **Testing**: unit tests for the core logic (pure functions with mocked `browser.*` APIs) + integration tests against real seeded throwaway browser profiles. Never test deletion logic against a real profile. TDD only if explicitly requested.

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
