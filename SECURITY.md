# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

If you find a security issue (e.g. the local server exposing data beyond `127.0.0.1`, token leakage, path traversal), please **do not** open a public issue with sensitive details.

Instead, open a [GitHub Security Advisory](https://github.com/70hundert/cursor-usage-analytics/security/advisories/new) or contact the maintainer privately via GitHub.

## Scope notes

This project is a **local-only** dashboard:

- Bind the server to `127.0.0.1` (default). Do not expose it to the public internet.
- Never commit `.env`, session tokens, or real usage CSV exports.
- The unofficial Cursor live API uses personal session cookies — treat them like passwords.
