# Security

## Reporting a vulnerability

Please report security issues privately so we can address them before public disclosure.

On GitHub, use **Security → Report a vulnerability** so the report stays non-public until resolved. If you cannot use that flow, contact maintainers through whatever private channel they publish for security (see the repo **README** or org profile).

Include:

- A short description of the issue and its impact
- Steps to reproduce (or a proof-of-concept if safe to share)
- Affected versions or commit hash, if known

## Scope notes

DevClip stores clipboard history and settings locally (SQLite). Treat the data directory as sensitive. API keys and license material may be stored using the OS secret store when available; see the application code for details.

We do not guarantee a response SLA for unfunded community reports; critical issues will be prioritized when maintainers are available.
