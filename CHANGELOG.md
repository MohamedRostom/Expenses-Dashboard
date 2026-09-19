# Changelog

All notable changes to this project are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Unreleased changes sit at the top until a tag is cut.

## [Unreleased]

### Fixed

- App header nav (Month · Year · Categories · Settings) on signed-in screens — settings and the other views were previously reachable only by typing the URL.
- Onboarding: Skip, Finish, "Add an expense" and "Connect Notion" now leave the wizard — the session store takes the PATCHed user, so the router guard no longer bounces every route back to `/onboarding`.

### Added

- Phase 0 foundation: pnpm monorepo (`apps/web`, `apps/api`, `packages/*`, `tests/e2e`), `/healthz` and the Hello page, `users` migration, Docker and compose stack, Fly and Cloudflare configs, CI pipeline (lint → typecheck → unit → api → worker-build → e2e-ci), Fly preview per PR, staging deploy from `main`, e2e-local skeleton, repo hygiene (PR template, CODEOWNERS, Dependabot, CodeQL, SECURITY.md, `.env.example` with startup validation), ADR-0001 and draft ADR-0002.
- Phase 1 — accounts and currency core: email+password auth (Argon2id) and Google OIDC sign-in, server-side sessions with rotation, CSRF, auth rate limits, account deletion and JSON data export; settings page (profile, default currency, theme, delete account); `Money` type and conversion/rounding in `packages/core` with property-based tests; `connectors/rates` frankfurter client + fixtures + fake and the nightly rate-cache job; `packages/ui` design tokens and base components; ownership-matrix auth API suite.
- Phase 2 — expenses: add/edit/delete expense flows in multiple currencies, categories (seeded defaults, fixed/variable/one-off kinds), month view with category bars and entries table, CSV/column-mapped import with an undoable batch commit, budget core and forecast maths.
- Phase 3 — Notion sync and auto-capture: Notion public OAuth connector with encrypted tokens, database picker / "create one for me", two-way sync engine (`last_edited_time` diff, latest-edit-wins, audit table) on a 5-minute schedule plus immediate app-side runs, Connectors settings page; generic capture webhook (`/hooks/generic/<token>`) with dedupe, category mapping and token rotation.
- Phase 4 — premium UI, PWA, landing page: motion tokens, skeleton/empty/error states, command palette, responsive audit at 360px; installable PWA with an offline add-queue that flushes on reconnect and an install prompt; year view, category drill-down, budget forecast and month comparison insights; `apps/landing` marketing site (vite-ssg) with three-step onboarding, privacy and terms pages; in-app first-login onboarding.
