# Changelog

All notable changes to this project are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Unreleased changes sit at the top until a tag is cut.

## [Unreleased]

### Fixed

- `deploy-fly`'s promote-production job deploys with `infra/fly/fly.toml` (it failed on the machineless production app) and rolls back by redeploying the previous image (`flyctl releases rollback` doesn't exist); `jobs-safety-net` runs the current release image instead of a nonexistent `:latest`.
- The post-deploy smoke is seven atomic tests, one concern each (health, sign-up, add, edit, delete, currency change, account deletion), each on its own API-created account, instead of one chained round trip.
- Sign-up no longer fails when the verification email can't be sent (the account was saved but the request 500'd, and retries silently did nothing). Unverified accounts can now sign in for 7 days; Settings shows an "Unverified" badge with "Resend verification email"; after 7 days sign-in is locked until verified, and housekeeping only purges unverified accounts that never signed in (FR-001 revised).
- Deploy workflows set `RESEND_API_KEY`/`MAIL_FROM` on preview, staging and production Fly apps when the matching `*_RESEND_API_KEY`/`*_MAIL_FROM` repo secrets exist (ADR-0002 item 2: Resend).
- `pnpm --filter @desk/db db:seed` silently did nothing on Windows (hand-built `file://` path never matched `import.meta.url`), and the seeded `e2e@desk.test` user had no categories; seed now uses `pathToFileURL` and inserts the default categories idempotently (palette shared via `@desk/core`'s `seedColour`).
- App header nav (Month · Year · Categories · Settings) on signed-in screens — settings and the other views were previously reachable only by typing the URL.
- Onboarding: Skip, Finish, "Add an expense" and "Connect Notion" now leave the wizard — the session store takes the PATCHed user, so the router guard no longer bounces every route back to `/onboarding`.
- Cloudflare Worker (`apps/api/src/worker.ts`): password hashing, rate limiting, mail and FX rates were lazy placeholders that threw on every use; now real, Workers-compatible adapters (mailer/connector-token encryption still need `RESEND_API_KEY`/`SECRET_BOX_KEY` as Cloudflare secrets before Stage 2 goes live).
- Settings' session list now shows a parsed browser/operating system pair instead of the raw User-Agent string (FR-004).
- Housekeeping job now purges `expense_versions` rows older than 12 months (FR-015) — the table existed since Phase 3 but the purge step was left unwired.
- Landing page: the `screenshots` array was defined but never rendered; wired up and populated with real captures of the month view, category budgets and the mobile month view.

### Added

- Phase 0 foundation: pnpm monorepo (`apps/web`, `apps/api`, `packages/*`, `tests/e2e`), `/healthz` and the Hello page, `users` migration, Docker and compose stack, Fly and Cloudflare configs, CI pipeline (lint → typecheck → unit → api → worker-build → e2e-ci), Fly preview per PR, staging deploy from `main`, e2e-local skeleton, repo hygiene (PR template, CODEOWNERS, Dependabot, CodeQL, SECURITY.md, `.env.example` with startup validation), ADR-0001 and draft ADR-0002.
- Phase 1 — accounts and currency core: email+password auth (Argon2id) and Google OIDC sign-in, server-side sessions with rotation, CSRF, auth rate limits, account deletion and JSON data export; settings page (profile, default currency, theme, delete account); `Money` type and conversion/rounding in `packages/core` with property-based tests; `connectors/rates` frankfurter client + fixtures + fake and the nightly rate-cache job; `packages/ui` design tokens and base components; ownership-matrix auth API suite.
- Phase 2 — expenses: add/edit/delete expense flows in multiple currencies, categories (seeded defaults, fixed/variable/one-off kinds), month view with category bars and entries table, CSV/column-mapped import with an undoable batch commit, budget core and forecast maths.
- Phase 3 — Notion sync and auto-capture: Notion public OAuth connector with encrypted tokens, database picker / "create one for me", two-way sync engine (`last_edited_time` diff, latest-edit-wins, audit table) on a 5-minute schedule plus immediate app-side runs, Connectors settings page; generic capture webhook (`/hooks/generic/<token>`) with dedupe, category mapping and token rotation.
- Phase 4 — premium UI, PWA, landing page: motion tokens, skeleton/empty/error states, command palette, responsive audit at 360px; installable PWA with an offline add-queue that flushes on reconnect and an install prompt; year view, category drill-down, budget forecast and month comparison insights; `apps/landing` marketing site (vite-ssg) with three-step onboarding, privacy and terms pages; in-app first-login onboarding.
