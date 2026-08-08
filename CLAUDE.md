# Stale Cookie

Browser extension that clears stale browser data — data belonging to sites not visited recently — while preserving data for recently-visited sites. Firefox first, Chrome later. Currently a personal project; will be published (AMO, then Chrome Web Store).

Name availability was checked 2026-08-07: no collisions on AMO, Chrome Web Store, GitHub, or in the cookie-cleaner extension space (informal check; no formal trademark search).

## Scope

Data types targeted (eventually): cookies, browsing history, download history, form data, cache/temporary files. Site settings are **out of scope for good** (decided 2026-08-07): Firefox exposes no API to clear them (see verified constraints) and they will not be pursued on Chrome either.

Rule: **per-site deletion where the browser APIs allow it.** Data types that can only be cleared globally (Firefox's `browsingData` cannot scope cache or form data to a hostname) are supported as a **global clear**: a separate action invoked directly, without scanning — no staleness, no preview list, since it's all-or-nothing. The staleness/scan/preview flow applies only to per-site data types. **A global clear always requires an explicit in-UI confirmation step** — it bypasses the preview safety mechanism, so the UI must make clear it deletes ALL data of that type, not just stale sites.

## Roadmap

- **v0.1**: manual cleaning of cookies only, with preview before deletion and a manual whitelist. Build up from there.
- **v1.0**: first published version, covering most of the decisions in this file.
- Undo (e.g. snapshotting cookies before deletion) is a secondary/later feature; preview is the required safety mechanism.

## Product decisions

- **Staleness**: configurable threshold per data type (cookies vs history have different blast radius). Global-clear types (cache, form data) have no threshold — they are never scanned.
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
- **Last-visited source**: `browser.history` only. Decided 2026-08-07: the extension does **not** retain visit timestamps after deleting history (deleting history should delete that metadata too — an earlier "visit memory" was removed for this reason). The action log records what was deleted, not when sites were visited. Because the preview merges all data types into one row per site, cookies and history are deleted together; the one config where deleted history leaves cookies looking "never visited" (cookie threshold > history threshold) gets a warning on the options page instead.
- **Permissions**: permissions the core always needs are requested at install (no point deferring them); feature-specific permissions go behind optional runtime requests (`permissions.request`) when the user enables the feature.
- **Testing**: unit tests for the core logic (pure functions with mocked `browser.*` APIs) + integration tests against real seeded throwaway browser profiles. Never test deletion logic against a real profile. TDD only if explicitly requested.

### Implementation decisions

- **PSL/eTLD+1**: `tldts` (bundles the Public Suffix List, works offline).
- **Partitioned cookies** (CHIPS/`partitionKey`): staleness is judged by visits to the **partition top-level site**, not the cookie's own domain — the cookie is only ever sent while visiting that site. In the preview they appear (with a "partitioned" badge) in the partition site's row.
- **Preview rows: one per site** (eTLD+1 of the visit domain, decided 2026-08-07). All data types share the row; deleting a row deletes its stale/never-visited data of every enabled type together. Container cookie groups fold into their domain's row (container badges shown). The whitelist protects a group when either its own domain or its visit domain is whitelisted.
- **Container enumeration**: via `contextualIdentities.query()` (permission added) — `cookies.getAllCookieStores()` only lists stores with open tabs, which would miss closed containers. The private-browsing store is excluded: its cookies are session-only.
- **Cookie enumeration**: per store with `partitionKey: {}` (matches partitioned + unpartitioned) and `firstPartyDomain: null` (matches all when first-party isolation is on; needs a cast, typings only allow string).
- **Default thresholds**: cookies 90 days (conservative — deleting cookies logs people out), history 180 days (deleted history is unrecoverable, so it lives longer), downloads 90 days. History cleaning is ON by default (its permission is install-time anyway); downloads cleaning is OFF until enabled (optional `downloads` permission).
- **Reminder implementation**: exact `alarms` alarm at `reminderBase + reminderDays` (`reminderBase` in `storage.local` = install, last clean, or last skip). Badge = `action.setBadgeText('!')`, red. Notification (optional `notifications` permission, requested from the options page) fires **once per cycle** (`reminderNotifiedAt` guard) so browser restarts don't re-notify; the badge does reappear on restart until cleaned/skipped. The popup shows "Skip this reminder" only while due. Timer resets on preview deletion or skip — a global clear does NOT reset it (it doesn't touch stale per-site data). `alarms` is an install-time permission (reminder is on by default: badge on, notification off, 30 days).
- **Global clear UI**: options-page section (checkboxes for cache and form data) with a native `confirm()` modal — synchronous on purpose, so the `browsingData` permission request that follows still runs in a valid user-input handler. Lives on the options page, not the popup, because permission doorhangers misbehave over popups.
- **Popup confirmations are inline, never native dialogs**: `window.confirm()` called from a toolbar popup panel on Firefox shows a dialog with no title/message (observed 2026-08-08; same family as the doorhanger problem). The preview's delete confirmation swaps the button for an inline message + Yes/Cancel instead. `confirm()` remains fine on the options page (a normal tab).
- **Scheduled/automatic cleaning**: opt-in setting (`autoCleanEnabled`, default off; interval default 7 days). Runs entirely in the background event page from an exact `alarms` alarm at `autoCleanBase + interval` (`autoCleanBase` in `storage.local` = when enabled or last run; **cleared on disable** so re-enabling starts a fresh cycle instead of cleaning immediately). Deletes exactly what a manual preview would pre-check: stale groups + never-visited groups under the same preselection policy (`selectForAutoClean` in core, unit-tested); whitelist always protects. No preview by design (CLAUDE.md requires preview "at minimum in manual mode"); the action log is the record. Each run resets the reminder base (an automatic clean is still a clean); while enabled the manual reminder is suppressed and its options controls grayed out. Alarms don't survive browser restarts — rescheduled `onStartup`, where an overdue run fires immediately. **Chrome-port note (MV3)**: there the background is a service worker the alarm must wake; scan+delete must finish within its lifetime (fine for fast scans; recheck with huge histories).
- **Config import/export**: options-page section; JSON file with a versioned envelope (`{version: 1, settings}`) so future formats can migrate. Export via Blob + `<a download>` (needs no permission). Import is tolerant: the envelope must match, but individual fields are validated by type/range and fall back to defaults when invalid or unknown; whitelist entries are re-normalized to eTLD+1, deduped, sorted (`serializeSettings`/`parseSettingsImport` in `core/settings.ts`, unit-tested — the `Settings` type and defaults moved to core for this, `ext/settings.ts` re-exports). Permission-gated flags (`clearDownloads`, `reminderNotification`) are turned off on import when the optional permission is missing in this profile — permissions can't travel in a file; re-enabling them triggers the request. Only config is exported: per-profile state (reminder/auto-clean bases, action log) stays put.
- **Action log**: `storage.local`, capped at 200 entries.
- Manual scan/preview/delete runs in the popup (no background messaging); automatic cleaning runs in the background independently. Acceptable while scans are fast.
- **Dev/test environment**: WSL2 (Ubuntu). Manual testing runs in **Windows Firefox** with a dedicated `stale-cookie-dev` profile (`firefox.exe -CreateProfile stale-cookie-dev`, launch with `-P stale-cookie-dev -no-remote`), loading `dist/manifest.json` as a temporary add-on via `about:debugging` from `\\wsl.localhost\Ubuntu\home\<user>\stale-cookie\dist`. After a rebuild, use the Reload button there; temporary add-ons unload when Firefox closes. **Gotcha**: Reload does not refresh `_locales` (Firefox caches i18n messages at load — new keys come back as empty strings), so after changing `messages.json` (or the manifest), Remove the add-on and re-load it instead. The Linux-Firefox/WSLg route (`web-ext run`) was abandoned: Firefox crashed and buttons misbehaved under WSLg.

### Verified API constraints (2026-08-07)

- Neither Firefox nor Chrome exposes cookie creation/last-accessed time to extensions. `cookies.Cookie` has `expirationDate` as its only time field. Firefox tracks `lastAccessed`/`creationTime` internally (`nsICookie` / `moz_cookies`) but drops them at the WebExtensions boundary (`ext-cookies.js` `convertCookie`). Staleness must therefore be derived from history, not from the cookies themselves.
- `history.search()` defaults: `startTime` = last 24h (pass `0` to search all history), `maxResults` = 100 (raise explicitly). Results are reverse-chronological; `HistoryItem.lastVisitTime` is the key field.
- **Unit mismatch**: `cookies.Cookie.expirationDate` is in **seconds**; history API times are in **milliseconds**. Convert deliberately.
- Firefox-specific cookie fields: `firstPartyDomain`, `partitionKey` — relevant for containers and partitioned cookies.
- `history` permission is desktop-only on Firefox (not Firefox for Android).
- **`browsingData` on Firefox** implements: cache, cookies, downloads, formData, history, indexedDB, localStorage, passwords, serviceWorkers. **`siteSettings` is not in Firefox's schema at all** (passing it is a validation error) — extensions cannot clear site settings on Firefox; skipped there, revisit at the Chrome port.
- **`RemovalOptions.hostnames` is honored only for cookies, indexedDB, localStorage, serviceWorkers.** For history, downloads and formData it is **silently ignored and everything in the time range is deleted** — never use `browsingData` for per-site history/downloads; use `history.deleteUrl` / `downloads.erase` per item instead. Also: hostnames don't match subdomains (each must be listed explicitly).
- `browsingData.removeCache` always clears the ENTIRE cache (`since` is ignored); `removeFormData` honors `since`.
- **Firefox's `downloads` API only sees the session download list**, not older download history stored in Places (Bug 1255507, open) — `downloads.search`/`erase` can't reach old entries. `downloads.search({})` has no default limit on Firefox (Chrome defaults to 1000; `limit: 0` disables it there — Chrome-port note).
- `permissions.request()` must run inside a user-input handler **with no `await` before it** (awaiting drops user-handler status). Most reliable from the options page tab; the popup's permission doorhanger can render behind the popup — request optional permissions from the options page only.

## Privacy stance

- **No network requests, ever.** No telemetry, no analytics, no phone-home.
- Data needed for the extension to function (visit correlation, action log, config) is collected and stored **locally only** and never shared.
- Error reporting = user-facing log consultation/export + the public issue tracker. No automatic reporting.

This stance is a published commitment (privacy policy for AMO) — do not introduce anything that contradicts it.

## Project conventions

- **License**: MIT (decided before first commit).
- **Localization**: English + Spanish from the start; English is the default. All UI strings go through `i18n.getMessage()` from the first line of UI code — never hardcode user-facing strings.
- Build must be reproducible/documentable (AMO requires source submission for bundled/minified code).
