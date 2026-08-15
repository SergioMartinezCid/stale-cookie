# Contributing to Stale Cookie

Thanks for your interest! Bug reports and pull requests are welcome — but please read the scope section first: it exists so nobody spends time on a PR that can't be merged.

## Project scope (please read before proposing features)

Stale Cookie is deliberately small: it deletes stale browsing data (data from sites you haven't visited recently) with a preview, and it does nothing else. Small scope is what keeps it auditable, low-maintenance, and worthy of the broad permissions it holds.

**New features need justification.** Before writing code, open an issue describing the problem you're solving and why it belongs in this extension rather than another one. A feature is likely to be accepted when it makes the existing flow (scan → preview → delete → undo) safer, clearer, or more accurate — and likely to be rejected when it grows the extension into a general-purpose privacy suite.

Some things are **out of scope for good** — please don't open PRs for them:

- **Anything that makes a network request.** No telemetry, no analytics, no update checks, no sync services, no remote configuration. "No network requests, ever" is a published privacy commitment.
- **Retaining visit timestamps** in the extension's own storage. Staleness is always derived from browser history, so deleting your history also deletes what the extension knows.
- **Clearing site settings/permissions** (no usable cross-browser API).
- **Undo for history or downloads** (undoing history would require retaining visit data; download entries can't be re-created via the API).
- **Auto-detecting which sites to protect.** The whitelist is manual and explicit by design.

Bug fixes, accessibility improvements, translation fixes, and documentation improvements don't need prior discussion — just open the PR.

## Development setup

Requires Node 20 (see `.nvmrc`) and npm 10. Linux is the tested environment (WSL2 works).

```sh
npm ci
npm run build            # emits dist/ (Firefox) and dist-chrome/ (Chrome)
npm test                 # unit tests
npm run test:integration # builds, then drives the extension in headless Firefox + Chrome
npm run typecheck
npm run lint:ext
```

For manual testing, load `dist/manifest.json` as a temporary add-on via `about:debugging` (Firefox) or `dist-chrome/` as an unpacked extension (Chrome). **Never test against a browser profile you care about** — this extension deletes data, and history/download deletions are unrecoverable. The integration tests use throwaway profiles for exactly this reason.

## Pull request expectations

- **Both browsers.** There is one shared bundle; Firefox/Chrome differences are gated at runtime (`isFirefox()` in `src/ext/browserInfo.ts`). A change that works on only one browser isn't done.
- **All user-facing strings go through `i18n.getMessage()`** — never hardcode them — and English (`src/_locales/en`) and Spanish (`src/_locales/es`) must stay in sync. Counts use the `msgCount` helper with `<key>One` singular variants. If you can't write the Spanish translation, say so in the PR and leave the English text in both files clearly marked.
- **Tests**: core logic (pure functions in `src/core/`) gets unit tests; behavior that touches real browser APIs belongs in the integration suite.
- `npm test`, `npm run typecheck`, and `npm run lint:ext` must pass.
- Keep PRs focused — one change per PR.

## Language, support, and conduct

- Repo docs and issues are in **English** (the extension UI is EN+ES, but translating docs would double maintenance). Issues in Spanish are welcome — replies may be in English.
- Support is **best-effort** by a solo maintainer: security and privacy issues get priority; there is no response-time guarantee.
- Be civil. The maintainer's decisions on scope are final.

## Reporting bugs

Please include browser and version, extension version, and what you expected vs. what happened. If an error occurred, attach the log export (options page → Logs → Export) — it anonymizes site names by default, so it's safe to share; that anonymized export is exactly what makes bugs diagnosable without exposing your browsing.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) that covers the project.
