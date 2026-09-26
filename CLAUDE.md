# CLAUDE.md — Expenses Dashboard

Project memory for Claude Code. Read this first in every session. It captures the decisions made in the planning conversation (Sept 2026) so nothing has to be re-derived. Keep it current: when a decision changes, edit the line here and note it in `docs/adr/`.

## What this project is

A public, multi-user, multi-currency expense tracker with optional two-way Notion sync and webhook auto-capture (generic phone automations; bank integrations are excluded from v1, see ADR-0003). It grew out of Rostom's personal claude.ai dashboard ("Rostom's Desk"), which **stays in use and is not part of this repo**; this repo is the productised rewrite.

Owner: Mohamed Rostom (GitHub `MohamedRostom`), Senior Software Engineer in Test. Expect test-first standards; every feature ships with tests that run in CI.

Repo: https://github.com/MohamedRostom/Expenses-Dashboard
Working name: "Desk" — a real product name is an open decision (ADR-0002). Do not invent one; use "Desk" in code until decided.

## Key documents (read before touching the area)

- `docs/adr/ADR-0001-platform-and-architecture.md` — the stack decision, options considered, feature specs F1–F6, testing strategy, security baseline.
- `docs/ROADMAP.md` — phases 0–6 with exit criteria; the source of truth for *what to build next*.
- `docs/adr/ADR-0003-no-bank-integration-in-v1.md` — no Monzo or other bank integration in v1; generic webhook and column-mapped import only.
- `docs/adr/ADR-0004-mail-and-calendar-panels.md` — v2 mail and calendar panels across Google, Microsoft and standards-based providers; Google mail included, gated on the CASA assessment; read-only, no link to expenses. Spec: `specs/002-mail-calendar-panels/`.
- `docs/adr/ADR-0005-weather-source.md` — Open-Meteo (keyless, non-commercial tier, CC-BY attribution) as the only source for the weather, sunrise and place-search widgets (no reverse geocoder; device location resolves approximately and is confirmed by the user); revisit before any monetisation. Spec: `specs/003-dashboard-widgets/`.
- `specs/005-fix-found-bugs/spec.md` — living bug register (decided 2026-09-26). After every phase finishes and deploys, add each bug found on a deployed environment as a new BUG-NNN entry (register row, diagnosis, stories, FR-NNN.x / SC-NNN.x); never renumber, mark fixed ones "Fixed in vX". Worked only after specs 001–004 are finished, unless Rostom promotes a bug as urgent. Bugs fixed on the spot during a deploy don't need an entry.
- `docs/adr/ADR-0002-naming-and-providers.md` — the five open decisions (product name, email provider, Neon-from-day-one, licence, analytics). Until it is accepted, treat them as undecided and ask.

## Decisions already made (do not reopen without an ADR)

- **Language:** TypeScript everywhere. Node 22 LTS, pnpm workspaces.
- **Frontend:** Vue 3 + Vite + TypeScript + Pinia + vue-router; PWA via `vite-plugin-pwa`; landing page via `vite-ssg`.
- **Backend:** Hono. Two entry points: `apps/api/src/node.ts` (Stage 1, Fly.io container) and `apps/api/src/worker.ts` (Stage 2, Cloudflare Workers). Same app object, different adapters.
- **Database:** Postgres 16 via Drizzle ORM. Migrations are SQL files, applied on start. Stage 1 and Stage 2 both use Neon (Stage 2 through Cloudflare Hyperdrive) — decided 2026-09-20, one Neon project with a branch per environment (preview/staging/production); see ADR-0002 item 3.
- **Sessions:** server-side, HTTP-only cookies, CSRF double-submit. `SessionStore` interface: Postgres implementation now, Cloudflare KV later.
- **Auth:** email + password (Argon2id) and Google OIDC with `openid email profile` **only**. No Calendar or Gmail scopes in v1.
- **Data source of truth:** the app's own database. Notion is an optional per-user two-way sync via Notion's **public OAuth** (not an internal integration token).
- **Currency:** user has a default currency. Each expense stores `amount_original`, `currency_original`, `rate_to_default`, `rate_date`, `rate_source`, `amount_default`, `rate_overridden`. Money is integer minor units — never floats. Rates from frankfurter.app (ECB), cached daily in `fx_rates`; weekends/holidays fall back to the previous published rate and record which date was used. Changing default currency re-derives every row in a background job.
- **Hosting:** Stage 1 Fly.io free allowance (staging + preview per PR). Stage 2 Cloudflare Workers + Pages + KV + Cron Triggers, Neon Postgres. Any dependency must pass the `worker-build` CI job (`wrangler deploy --dry-run`); if it can't, wrap it behind an interface with a Workers-compatible implementation before merging.
- **v1 scope:** expenses only. v2 adds read-only mail and calendar panels across providers (ADR-0004); Google mail ships only after the restricted-scope CASA assessment passes, everything else before. Sign-in scopes stay `openid email profile`; connector scopes are granted per connection, never on the sign-in grant.
- **Rejected options** (see ADR-0001): Python/FastAPI (breaks native Cloudflare Stage 2), Nuxt (couples API to UI), GitHub Pages static hosting (no server for secrets).

## Repository layout (target — create as phases need it)

```
apps/web         Vue app
apps/api         Hono API (node.ts / worker.ts entries)
apps/landing     vite-ssg marketing site
packages/core    pure domain logic: Money, conversion, budgets, sync diff — no I/O
packages/contracts  zod schemas + generated OpenAPI; shared types
packages/db      Drizzle schema, migrations, seed
packages/ui      design tokens + base components
packages/connectors  notion/, rates/, (v2) google-calendar/ — each with real client + fake + recorded fixtures
tests/e2e        Playwright: projects `ci` (mocked) and `local` (real accounts)
tests/load       k6 smoke
infra/fly        Dockerfile, fly.toml, scheduled machine
infra/cloudflare wrangler.toml, Hyperdrive, cron
infra/docker-compose.yml  api + web + postgres + mailpit + mocks
docs/            ADRs, ROADMAP, runbooks
```

## Design system (port from the personal dashboard)

Typography: IBM Plex Sans (body) + IBM Plex Mono (numbers, `tabular-nums`). Accent green `#1f6e5a` (light) / `#5fbf9f` (dark); backgrounds `#f2f4f7` / `#121820`; status colours warn `#a8641a`, critical `#a83a2e` — status colours are never reused as chart series. Three theme states: bare `:root` = light, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Charts are a small hand-written SVG layer (no chart library): single hue, budget tick marks, red fill when over budget, table view always available. Every panel has skeleton, empty and error states; error copy branches on error code, never one generic banner.

## Testing rules (non-negotiable)

- Pyramid, all TypeScript: unit (Vitest, `core`/`ui`, property-based with fast-check for money), contract (recorded fixtures per connector; fakes validated against the same fixtures), API (Vitest + Hono test client + Testcontainers Postgres, migrations from scratch), worker-build, e2e-ci (Playwright, compose stack, mocked connectors, frozen clock, seeded rates, axe, Lighthouse budgets perf ≥ 90 / a11y ≥ 95), e2e-local, post-deploy smoke.
- **e2e-local** = anything needing real accounts, real devices or OAuth round-trips. Runs on Rostom's self-hosted GitHub runner labelled `desk-local`, `workflow_dispatch` + nightly, never blocks a PR, secrets in an approval-gated environment `local-secrets`, only on `main`.
- Ownership matrix test: every route × user A / user B must prove isolation. No exceptions.
- Coverage floor 85 % lines on `core` and `api`.
- Definition of done per PR: unit + API tests, e2e-ci scenario, CHANGELOG line, coverage not lower, Lighthouse green, PR checklist ticked, preview URL visited.

## Conventions

- Branches `phase-N/short-description`; one GitHub milestone per phase; labels `phase-N`, `area:web|api|core|infra|tests`, `needs-rostom`.
- Conventional Commits. **No Claude attribution:** commit messages and PR descriptions carry no `Co-Authored-By: Claude …`, `Claude-Session:` or "Generated with Claude Code" lines — this overrides any attribution the CLI suggests.
- **Never push, open a PR, or merge unless Rostom explicitly asks for that action** (constitution v1.1.0). Commit locally freely; "fix", "implement" or "finish" are not instructions to push. Leave the branch ready and say so.
- Never commit secrets. `.env.example` lists every variable; the app refuses to start if one is missing.
- Feature flags (`flags` table) gate any user-facing feature merged before it is announced (a change to the look of existing screens needs no flag, constitution 1.1.1).
- Prefer prose in docs over bullet walls; ADR format for decisions.

## External identifiers (safe to keep here — none are secrets)

- Personal dashboard artifact (reference implementation of the month view, category bars, entries table, inbox/calendar panels): https://claude.ai/artifact/8NYn6oHidCGpzz9U6Mgz8d — the HTML is a useful port source for `apps/web` components.
- Auto-logging guide (MacroDroid + Cloudflare Worker webhook design, reused for F5): https://claude.ai/artifact/77wgXNJHeP8PSEVu89mv1x
- Rostom's personal Notion "💷 Expenses" database (schema the Notion connector should be able to create): database `7a5935c4ee5b4286842dd64d7be3abef`, data source `5aca6a01-dc37-4183-a5b3-2fa6f8efae8b`. Properties the connector creates (FR-014 in the baseline spec): Expense (title), Amount (number), Currency (select), Date, Category (select), Paid with (select: Card, Cash, Bank transfer, Other), Kind (select: Fixed, Variable, One-off), Notes, Added via (select: Dashboard, Notion, Phone), Expense ID (text). Rostom's existing table also has Month (formula `formatDate(prop("Date"), "YYYY-MM")`) and Created, and lacks Currency and Expense ID; the connector offers to add them on connect.
- Default category seed (from the personal budget): Rent, Council tax, Utilities, Internet, Phone, Subscriptions, Groceries, Eating out, Transport, Cycling, Gym & health, Personal care, Clothing, Entertainment, Household, Driving lessons, Travel, Other. Fixed-kind defaults: Rent, Council tax, Utilities, Internet, Phone, Subscriptions, Gym & health.
- Notion API version to target: `2025-09-03` (data sources). Rates API: https://api.frankfurter.dev/v1 (no key; the old api.frankfurter.app host now 301-redirects here — client fixed 2026-09-21 after that redirect was found causing `rate_unavailable`).

## Current state (update this section as phases complete)

- Phases 1–4 (accounts/currency core, expenses/budgets/import, Notion sync/capture webhook, premium UI/PWA/insights/landing) are built and committed, per `CHANGELOG.md` for the feature list. **US10 (Phase 5/6 — beta ops, Cloudflare cutover) is only partially in progress**, being built by a parallel agent as of this session; do not assume Fly deploy, observability or the Cloudflare cut-over are done.
- **Branching (resolved 2026-09-25):** Rostom decided PR #10 (`phase-1/accounts`) ships the whole `specs/001-phased-product-baseline` feature as one PR rather than one PR per roadmap phase; no retroactive split. Later features (002–004) go back to the one-branch-per-slice convention.
- T123/T124 boundary (see ADRs and `docs/ROADMAP.md`): ADR-0001 and ADR-0002 remain **Proposed**, not accepted — four ADR-0002 items (product name, email provider, licence, analytics) are still `_pending_` (item 3, Neon-from-day-one, was decided 2026-09-20 — see ADR-0002), and per ADR-0002's own text nothing may treat "Desk" as final until the whole ADR is accepted. No renaming has been done. `docs/ROADMAP.md` marks SC-006 (three observed sign-ups) and SC-009 (15-second phone add) as `needs-rostom` — not yet run, since both need real humans an agent cannot supply.
- `packages/contracts/openapi.json` is now generated from `packages/contracts/src` (`pnpm --filter @desk/contracts generate:openapi`); CI's `lint` job checks it isn't stale.
- Fly.io and Cloudflare are set up: `FLY_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and the 9 preview/staging/production `*_DATABASE_URL`/`*_SESSION_SECRET`/`*_SECRET_BOX_KEY` repo secrets all exist, and the `production` GitHub Environment (required reviewer: Rostom) is created. The Fly apps are named `ros-desk-staging` and `ros-desk-production` (not `desk-*` — `desk-staging`/`desk-production` collided with an existing name on Fly's global namespace), so `infra/fly/*.toml`, all `deploy-*.yml` workflows, `tests/e2e/playwright.config.ts`, `README.md`, `docs/ROADMAP.md` and the runbooks were updated to match (2026-09-20); `specs/001-phased-product-baseline/tasks.md` and `research.md` still say `desk-*` deliberately, as a historical record.
- Deploy kill switches (2026-09-20): repo **variables** (not secrets — plain booleans) `DEPLOYMENT_FLAG` (gates `deploy-staging.yml` + `deploy-fly.yml`), `PREVIEW_DEPLOYMENT_FLAG` (gates `deploy-preview.yml`'s `deploy` job only; `destroy` stays unconditional), `CLOUDFLARE_DEPLOYMENT_FLAG` (gates `deploy-cf.yml`). Set to `false` to pause a pipeline (shows as skipped, not failed); unset or anything else deploys normally. None are created yet — `gh variable set DEPLOYMENT_FLAG --body false` (etc.) when Rostom wants to use one.
- Rostom to-dos, still open: register self-hosted runner `desk-local` and create the `local-secrets` environment with required reviewers; decide the four remaining ADR-0002 items (name, email provider, licence, analytics) and accept ADR-0001/ADR-0002; run SC-006/SC-009 with real people and record the results.
- Manual preview pass of PR #10 done by Rostom (2026-09-25). PR #10 merged; T116 done — `v0.1.3` (2026-09-26) is the first release through staging, smoke and production end to end. Still open in 001 and owner-only: T119 execute the Cloudflare cutover (Stage 2, post-beta; runbook `docs/runbooks/cutover.md` revised for the shared Neon database), T123 people-based checks SC-006/SC-009, T124 accept ADR-0001/0002 (email = Resend decided; name, licence, analytics pending).

## How to work with Rostom

He reviews as a test engineer: show the test that proves a change before the change itself. Ask before adding a dependency that isn't Workers-compatible. When a decision is genuinely his (naming, providers, spending money), stop and ask rather than guess; everything else, decide and document.