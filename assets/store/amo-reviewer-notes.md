# AMO reviewer notes

Paste-ready text for the "Notes for Reviewers" field, plus the source-zip
instructions. Fill in the commit hash at submission time.

---

This extension's published commitment is that it makes NO network requests of any kind — no telemetry, no analytics, no update checks. It also runs no content scripts and does not use webRequest; a grep for fetch/XMLHttpRequest/WebSocket over src/ returns nothing.

PERMISSION JUSTIFICATIONS

- cookies + <all_urls> host permission: the core function is enumerating and deleting cookies for arbitrary domains the user visited (cookies.getAll / cookies.remove across every cookie store, src/ext/scanner.ts). The cookies API only reaches hosts covered by host permissions, and there is no narrower pattern that covers "any site the user ever visited". No content scripts are registered, so the host permission grants no page access in practice.
- history: the ONLY source of staleness (the extension deliberately keeps no visit records of its own), plus per-URL deletion via history.deleteUrl. browsingData is not used for history because RemovalOptions.hostnames is silently ignored for it.
- contextualIdentities: enumerate Firefox containers via contextualIdentities.query() so cookies in containers with no open tabs are found (cookies.getAllCookieStores() misses closed containers).
- storage: settings, whitelist, and a local action log (auto-pruned after 30 days). storage.session holds a memory-only error log and the cookie-undo snapshot; neither is ever persisted.
- alarms: the cleaning reminder and the opt-in scheduled cleaning.
- Optional (requested at feature enablement, options page): downloads (download-history cleaning via downloads.search/erase — list entries only, never files), browsingData (global cache/form-data clear behind an explicit confirmation), notifications (reminder notification).

BUILD / SOURCE SUBMISSION

The uploaded XPI bundles two npm dependencies (tldts, webextension-polyfill) via esbuild, so source is provided. Reproducing the build:

- Environment: Linux (any distribution; developed on Ubuntu), Node.js 20.15.1 (.nvmrc), npm 10.8.2. No network access needed beyond `npm ci`.
- Steps:
    npm ci
    npm run build
- Output: dist/ — compare file-by-file against the uploaded XPI's contents (the zip is produced with `npx web-ext build --source-dir dist`; only zip timestamps differ, file contents are deterministic: dependency versions are pinned by package-lock.json and sourcemaps are disabled in release builds).
- The source zip is `git archive` of commit <FILL-IN-COMMIT-HASH>, which is also published at https://github.com/SergioMartinezCid/stale-cookie
- Icons (src/icons/*.png) are pre-rendered and checked in; ImageMagick is only needed if regenerating them from assets/icon.svg, which the normal build does not do.
- THIRD_PARTY_NOTICES.md (bundle licenses: tldts MIT, webextension-polyfill MPL-2.0) ships inside dist/.

KNOWN LINT WARNING (intentional)

web-ext lint reports one warning: strict_min_version 140 predates Firefox for Android support for data_collection_permissions (which landed in 142 there). This is intentional: the extension is desktop-only (the history permission does not exist on Android) and Android availability is disabled on the listing; declaring gecko_android just to silence the warning would wrongly signal Android compatibility. Desktop Firefox 140 (current ESR) supports data_collection_permissions, and the full integration suite passes on Firefox 140.0esr.

TESTING

`npm test` runs 76 unit tests; `npm run test:integration` builds and drives the extension end-to-end in headless Firefox (and headless Chrome for Testing) with throwaway profiles — scan, preview classification, container/partitioned cookie handling, deletion, action log, undo.
