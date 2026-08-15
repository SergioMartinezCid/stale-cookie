# Stale Cookie — Privacy Policy

**Effective date: 2026-08-15**

The short version: **nothing ever leaves your browser.** Stale Cookie makes no network requests of any kind — no telemetry, no analytics, no update checks, no crash reporting, no sync. There is no server. Everything described below happens locally, inside your browser profile.

## What the extension does

Stale Cookie deletes browsing data (cookies, browsing history and, optionally, download history) belonging to sites you have not visited in a configurable number of days, and can clear the browser cache and saved form data globally on request. To decide what is stale, it reads data your browser already holds.

## Data the extension reads

- **Browsing history** — the only source of "when did I last visit this site". Read during a scan, processed in memory, never stored by the extension.
- **Cookies** (all cookie stores, including Firefox containers) and, if you enable it, the **download list** — enumerated during a scan so you can preview and delete them.

All of this processing is local. None of it is transmitted, and the extension deliberately keeps **no record of your visit times**: staleness is recomputed from browser history on every scan, so deleting your history also deletes everything the extension could know about it.

## Data the extension stores (locally only)

- **Settings**, including your protected-sites list — in extension storage in your profile.
- **Action log** — a record of what the extension deleted (site names and item counts, never visit timestamps), capped at 200 entries, in extension storage.
- **Error log** — kept in memory only, capped at 50 entries; it disappears when the browser closes and is never written to disk.
- **Undo snapshot** — when cookies are deleted, a copy is kept in memory only so you can restore them; it disappears when the browser closes and expires 24 hours after the deletion, whichever comes first.
- **Timers** for the cleaning reminder and automatic cleaning.

None of this is shared with anyone, including the developer.

## Log export

If you choose to export the logs (for example, to attach to a bug report), the export is created locally as a file you save yourself. The **anonymize option is on by default**: site names are replaced with consistent pseudonyms (`site-1.example`, …) and URL paths are dropped, so patterns stay diagnosable without exposing your browsing. Nothing is exported unless you do it, and nothing is sent anywhere by the extension.

## Data collection, sharing, and sale

Stale Cookie collects no personal data, no usage data, and no technical data. It shares nothing and sells nothing. There are no third-party services involved — the add-on listing platform (e.g. addons.mozilla.org) that distributes the extension is governed by its own privacy policy.

## Removing your data

Uninstalling the extension removes its stored settings and action log along with it (extension storage is deleted by the browser on uninstall). The in-memory logs and undo snapshot vanish whenever the browser closes.

## Changes to this policy

This policy lives in the extension's public repository; any change to it is visible in the repository history and will be noted in the release notes. The policy can only get stricter in spirit — "no network requests, ever" is a permanent commitment of the project.

## Contact

Questions or concerns: open an issue at <https://github.com/SergioMartinezCid/stale-cookie/issues>.
