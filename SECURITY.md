# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository (Security tab → "Report a vulnerability"), which reaches the owner directly. You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.

## Scope

The API, the web app, the connectors and the deployment configuration in this repository. Third-party services the app talks to (Fly.io, Cloudflare, Notion, frankfurter.app) have their own programmes.

## Baseline

Argon2id passwords, server-side sessions, CSRF double-submit, strict CSP, rate limiting, connector tokens encrypted at rest, Dependabot, CodeQL and secret scanning in CI. See `docs/adr/ADR-0001-platform-and-architecture.md` for the full baseline.
