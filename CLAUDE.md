# Stale Cookie

Browser extension that clears stale browser data — data belonging to sites not visited recently — while preserving data for recently-visited sites. Single MV3 codebase for Firefox and Chrome. v1.0.0 is published on AMO (https://addons.mozilla.org/en-US/firefox/addon/stale-cookie/); Chrome Web Store publication is deferred until the project has traction (Chrome users load `dist-chrome/` unpacked).

This file holds the working rules only. Dated decision history, rationale, review records, verification logs, and implementation detail live in `NOTES.md`.

## Product rules

- **Per-site deletion where the browser APIs allow it.** Per-site types (cookies, browsing history, download history) go through the staleness/scan/preview flow. Types the APIs can only clear globally (cache, form data) are a separate **global clear**: no scan, no staleness, no preview — and **always an explicit in-UI confirmation** making clear it deletes ALL data of that type. Site settings are out of scope for good.
- **Staleness**: configurable threshold per data type, derived from `browser.history` only — the extension never retains visit timestamps of its own (that would survive history deletion; the rejected "visit memory"). Global-clear types have no threshold.
- **Visit matching**: registrable domain (eTLD+1) via `tldts`. Visiting `mail.google.com` keeps `google.com` data fresh.
- **Preview**: cleaning always shows what will be deleted before committing (at minimum in manual mode). One row per site (eTLD+1 of the visit domain); all data types share the row and delete together. Partitioned (CHIPS) cookies fold into their **partition top-level site's** row — staleness is judged by visits to that site, not the cookie's own domain. Container cookie groups fold into their domain's row (badges shown).
- **Whitelist**: manual, explicit "never touch" list only — no auto-detection. Protects a group when either its own domain or its visit domain is whitelisted; always protects, including automatic cleaning.
- **Never-visited data**: if the scan finds no visit data for anything (fresh install, wiped history), that's no signal — no-op. If some sites have visits and others don't, never-visited sites are preselected for deletion by default; a setting flips them to never-preselected. Preselection only — the user can always override checkboxes.
- **Cleaning modes**: manual + automatic (opt-in, `autoCleanEnabled`). Manual mode reminds via toolbar badge (default) and optional system notification; "skip this reminder" resets the timer without cleaning. Automatic cleaning deletes exactly what a manual preview would pre-check (no preview by design; the action log is the record), resets the reminder base, and suppresses the manual reminder while enabled. A global clear does NOT reset the reminder timer (it doesn't touch stale per-site data); a failed delete doesn't either.
- **Undo**: cookies only, single level, from a pre-deletion snapshot in `storage.session` (memory-only — deleted cookie values are credentials), expiring at min(24 h `SNAPSHOT_TTL_MS`, browser session). History undo is out of scope for good; download entries cannot be re-created via the API. The preview's delete confirmation states these bounds — keep the copy in sync if they change.
- **Firefox containers**: `containerA:example.com` and `containerB:example.com` are separate entries. Enumerate cookies per `storeId` via `contextualIdentities.query()` — `cookies.getAllCookieStores()` misses closed containers. The private-browsing store (and Chrome's incognito store `"1"`) is excluded: session-only cookies.
- **Profiles**: "current profile only" is automatic (extension storage is per-profile). Config sharing across profiles happens via export/import, never a sync service — the no-network rule forbids it.
- **UI surface**: toolbar popup for routine cleaning (also the reminder vehicle); options page for configuration, optional-permission requests, global clear, logs, config import/export.

## Privacy stance

- **No network requests, ever.** No telemetry, no analytics, no phone-home.
- Data needed for the extension to function (visit correlation, action log, config) is collected and stored **locally only** and never shared.
- Error reporting = user-facing log consultation/export + the public issue tracker. No automatic reporting.
- Action log: `storage.local`, pruned to the last **30 days** (`ACTION_LOG_MAX_AGE_MS`; enforced on append and `onStartup` — deletion metadata must not become a long-term record of past sites), 200-entry cap as secondary bound. Error log: `storage.session` only, never persisted, capped at 50. Log-export anonymization happens **at export time only** (raw data stays local; anonymize defaults ON).

This stance is a published commitment (privacy policy for AMO) — do not introduce anything that contradicts it.

## Technical decisions

- **Manifest V3**, cross-browser WebExtensions common subset, **no MV2 split**: one shared JS bundle; only the manifest differs per target, generated at build time — `dist/` (Firefox, event page, strict_min_version 140 — the floor set by `data_collection_permissions`; verified on ESR 140.0 via the integration suite with `FIREFOX_BIN`. One ACCEPTED `web-ext lint` warning: Android-only, `data_collection_permissions` needs 142 there, but the extension has no Android support — don't "fix" it by adding `gecko_android`, that would signal Android compatibility to AMO) and `dist-chrome/` (service worker, `minimum_chrome_version` 123, `browser_specific_settings` dropped, `contextualIdentities` stripped). **Standing instruction: flag MV3 limitations to the user as they are encountered.**
- **Stack**: TypeScript, esbuild, `webextension-polyfill` (promise-based `browser.*` everywhere).
- Firefox/Chrome behavior differences are gated at **runtime** via `isFirefox()` in `ext/browserInfo.ts` (checks the `moz-extension:` URL scheme); containers are a runtime no-op on Chrome.
- **Permissions**: permissions the core always needs are requested at install; feature-specific ones go behind optional runtime `permissions.request()` when the user enables the feature.
- **Deletion executes in the background**: the popup sends a `delete-groups` runtime message (`DeleteGroupsRequest` in `ext/scanner.ts`) — popup pages are torn down on any outside click, which must never leave a deletion half-done and unlogged. The background handler does the bookkeeping (action log, reminder reset). Scan/preview stay in the popup (read-only, losing them is harmless). `deleteGroups` is resilient: per-group try/catch, partial counts always reach the action log; `runAutoClean` reschedules its next alarm in a `finally`.
- Alarms don't survive browser restarts — reschedule `onStartup`, where an overdue run fires immediately. On Chrome the background is a service worker the alarm must wake; scan+delete must finish within its lifetime (fine for fast scans; recheck with huge histories).
- **Theme**: dark/light setting (default dark); extension pages do not follow the OS theme. `applyTheme` (`src/ui/theme.ts`) forces `color-scheme` on the root, re-resolving the `light-dark()` tokens in `src/ui/theme.css`.
- **Testing**: unit tests for core logic (pure functions, mocked `browser.*`) + integration tests (`npm run test:integration`, builds first) driving the built extension in headless Firefox and headless Chrome for Testing with throwaway profiles. **Never test deletion logic against a real profile.** TDD only if explicitly requested.

## API constraints and gotchas (verified)

- Neither browser exposes cookie creation/last-accessed time to extensions (`expirationDate` is the only time field) — staleness must come from history.
- **Unit mismatch**: `cookies.Cookie.expirationDate` is in **seconds**; history API times are in **milliseconds**. Convert deliberately.
- `history.search()` defaults: `startTime` = last 24 h (pass `0` for all history), `maxResults` = 100 (raise explicitly). `history` permission is desktop-only on Firefox.
- **`browsingData.RemovalOptions.hostnames` is honored only for cookies, indexedDB, localStorage, serviceWorkers** — for history, downloads and formData it is silently ignored and everything in the time range is deleted. Use `history.deleteUrl` / `downloads.erase` per item instead. Hostnames don't match subdomains. `removeCache` always clears the ENTIRE cache (`since` ignored); `removeFormData` honors `since`. Firefox's schema has no `siteSettings` (passing it is a validation error).
- **Firefox's `downloads` API only sees the session download list** (Bug 1255507), not older Places history. `downloads.search({})` has no default cap on Firefox; Chrome caps at 1000 — pass `limit: 0` on Chrome only (0-semantics on Firefox unverified).
- `permissions.request()` must run inside a user-input handler **with no `await` before it**. Options page only — the popup's doorhanger can render behind the popup. (The global clear's native `confirm()` is synchronous on purpose so the follow-up request stays in the handler.)
- **Popup confirmations are inline, never native dialogs**: `window.confirm()` from a Firefox toolbar popup shows a blank dialog. `confirm()` is fine on the options page (a normal tab).
- **Chrome**: an unknown manifest permission is a load **ERROR**, not a warning. Chrome's schema validation rejects unexpected properties in API calls — `firstPartyDomain: null` is passed on Firefox only (needs a cast; matches all when first-party isolation is on). `partitionKey: {}` matches partitioned + unpartitioned on both browsers. Chrome's `history.addUrl` has no `visitTime` — visits can't be backdated (the Chrome integration test writes sub-second thresholds directly to storage; `loadSettings` doesn't clamp, only the options UI enforces the 1-day minimum).
- **Integration-test gotchas**: Marionette won't navigate to `moz-extension://` pages unless geckodriver runs with `--allow-system-access`; snap Firefox can't read profiles under `/tmp`, so the harness sets `TMPDIR` to repo-local `.tmp-profiles/`; `--load-extension` was removed from branded Chrome 137+ but kept in Chrome for Testing (the extension id is discovered from the service worker's DevTools target).

## Dev/test environment

- WSL2 (Ubuntu). Manual testing in **Windows Firefox** with the dedicated `stale-cookie-dev` profile (`firefox.exe -P stale-cookie-dev -no-remote`), loading `dist/manifest.json` as a temporary add-on via `about:debugging` from `\\wsl.localhost\Ubuntu\home\<user>\stale-cookie\dist`. Reload there after rebuilds — **but Reload does not refresh `_locales`**: after changing `messages.json` or the manifest, Remove the add-on and re-load it. Temporary add-ons unload when Firefox closes.
- **Windows Chrome**: chrome://extensions → Developer mode → Load unpacked → `\\wsl.localhost\Ubuntu\home\<user>\stale-cookie\dist-chrome`; if Chrome refuses the UNC path, copy `dist-chrome` to a Windows-local folder. Unpacked Chrome extensions survive browser restarts.

## Project conventions

- **License**: MIT.
- **Localization**: English + Spanish; English is the default. All UI strings go through `i18n.getMessage()` — never hardcode user-facing strings; keep EN and ES in sync. Plurals via `msgCount` + `<key>One` variants.
- Build must be reproducible/documentable (AMO requires source submission for bundled code; the README documents the build).
