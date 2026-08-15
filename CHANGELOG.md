# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-15

First published version, for Firefox and Chrome.

### Added

- Scan with preview: finds cookies, browsing history and (optionally)
  download history from sites not visited in a configurable number of days,
  grouped one row per site — nothing is deleted without the list being shown
  first. Partitioned (CHIPS) cookies fold into their partition site's row;
  Firefox container cookies fold into their domain's row, both labeled with
  badges.
- Protected sites: an explicit whitelist no scan or clean ever touches.
- Undo for deleted cookies: a memory-only snapshot, restorable for 24 hours
  while the browser stays open.
- Automatic cleaning (opt-in): a scheduled clean of exactly what a manual
  preview would pre-select.
- Cleaning reminder: toolbar badge by default, optional system notification,
  and a "skip this reminder" action.
- Global clear for cache and saved form data (the types browsers only clear
  globally), behind its own explicit confirmation.
- Action log with 30-day retention and a session-only error log, exportable
  as JSONL with site-name anonymization on by default.
- Config export/import, dark/light theme (default dark), English and
  Spanish.
- Privacy: no network requests, ever — see PRIVACY.md.

[1.0.0]: https://github.com/SergioMartinezCid/stale-cookie/releases/tag/v1.0.0
