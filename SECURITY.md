# Security Policy

## Supported versions

Only the **latest released version** (the one currently published on the add-on stores) receives security fixes. There are no backports.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting instead: the repository's **Security** tab → **Report a vulnerability**. That keeps the report private while it's being fixed.

This extension handles sensitive local data (cookies, browsing history) and holds broad browser permissions, so reports in these areas are especially welcome:

- Anything that causes a network request — the extension's published commitment is that it makes none, ever.
- Data ending up in persistent storage that is documented as session-only (error log, undo cookie snapshot).
- The log-export anonymizer leaking identifying data (site names, URLs, IPs) with anonymization on.
- Deletion or restore acting outside what the preview showed or the whitelist allows.

## What to expect

This is a solo-maintained project with best-effort support: security and privacy reports take priority over everything else, but there is no guaranteed response time. There is no bug bounty. You'll be credited in the release notes for a confirmed report unless you prefer otherwise.
