# Stale Cookie

Browser extension that clears stale browsing data — data belonging to sites you no longer visit — while preserving everything from the sites you use. For Firefox and Chrome.

## Install

<a href="#"><img src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" alt="Get the add-on for Firefox" height="60"></a>
<a href="#"><img src="https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png" alt="Available in the Chrome Web Store" height="60"></a>

*Store listings are not live yet — links will be added once published.*

## What it does

- **Scan with preview**: finds cookies, browsing history and (optionally) download history from sites you haven't visited in a configurable number of days, grouped one row per site. Nothing is deleted without you seeing the list first.
- **Protected sites**: an explicit whitelist that no scan or clean ever touches.
- **Undo**: every deletion snapshots its cookies first — restorable for 24 hours while the browser stays open. (History and downloads are unrecoverable by nature; the preview says so before you confirm.)
- **Automatic cleaning** (opt-in): a scheduled clean of exactly what a manual preview would pre-select, recorded in the action log.
- **Reminders** (manual mode): a toolbar badge — and, optionally, a system notification — when it's time to clean.
- **Action log and error log**: a local record of what was deleted, exportable as JSONL with an anonymize option for bug reports.
- **Firefox niceties**: container cookies (per-container stores) and partitioned (CHIPS) cookies are handled and labeled in the preview.

## Privacy

No network requests, ever. No telemetry. Everything the extension needs to work is stored locally in your browser and never leaves it. Error reporting is manual: you export the log yourself and attach it wherever you choose — the export anonymizes site names by default.

## Building from source

Reproducible from a clean checkout; no network access is needed beyond `npm ci`.

- **Environment**: Linux, Node 20 (built with v20.15.1, see `.nvmrc`), npm 10 (10.8.2).

```sh
npm ci
npm run build        # emits dist/ (Firefox) and dist-chrome/ (Chrome)
```

`dist/` is the Firefox extension; `dist-chrome/` is the same bundle with a Chrome-specific manifest. To produce the packaged Firefox artifact (what gets uploaded to AMO):

```sh
npx web-ext build --source-dir dist   # writes web-ext-artifacts/*.zip
```

The icons in `src/icons/` are pre-rendered and checked in, so the normal build has no image tooling dependency. Re-rendering them from `assets/icon.svg` (`npm run build:icons`) is only needed if the icon changes and requires ImageMagick (the legacy `convert` command).

## Development

```sh
npm run dev              # rebuild on change
npm test                 # unit tests (vitest)
npm run test:integration # drives the built extension in headless Firefox + Chrome (throwaway profiles)
npm run typecheck        # tsc --noEmit
npm run lint:ext         # web-ext lint against dist/
```

For manual testing, load `dist/manifest.json` as a temporary add-on via `about:debugging` (Firefox) or `dist-chrome/` via chrome://extensions → Load unpacked (Chrome). Never test against a real browser profile — deletion is irreversible; the integration tests use throwaway profiles created and destroyed per run.

## License

[MIT](LICENSE). Bundled third-party code (tldts, webextension-polyfill) is covered by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which also ships inside the extension package.
