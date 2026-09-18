# ADR-0001: Platform and architecture for the expenses product

**Status:** Proposed (v1 scope on Gmail and Calendar is amended by ADR-0004: mail and calendar panels in v2, Google mail included after the CASA assessment. F5 and the Monzo mentions in F3 and the testing strategy are amended by ADR-0003: no bank integration in v1)
**Date:** 2026-09-16
**Deciders:** Rostom (owner)
**Working name:** "Desk" (to be replaced by a product name before the landing page is built)

## Context

The current dashboard is a claude.ai artifact that borrows the viewer's connector logins to read Google Calendar, Gmail and Notion. It stays as Rostom's personal tool. This ADR covers a separate, public product built from the same ideas: a multi-currency expense tracker with optional Notion sync, later a calendar panel, deployed first on a free tier and then on paid infrastructure.

Decisions already taken in the requirements conversation:

- Public product from day one: sign-up, per-user data isolation, per-user connector credentials.
- The app's own database is the source of truth; Notion is an optional two-way sync, not a dependency.
- Stage 1 hosting on Fly.io (free allowance), Stage 2 on Cloudflare (Workers + Hyperdrive/D1 + Pages). The code must run unchanged on both.
- v1 ships expenses only. Google Calendar comes in v2 (sensitive scope, lighter review). Gmail is dropped from the public product because its restricted scope requires Google's CASA security assessment.
- Currency: user picks a default currency; any expense can be entered in another currency; the rate on the expense date is fetched, stored with the row, and the converted amount is persisted so reports never drift.
- Testing is mandatory for every feature and runs in the pipeline. UI tests that need real browsers, real accounts or the developer's machine run on a self-hosted GitHub Actions runner.
- "Premium UI" means: polished dashboard feel (motion, skeletons, empty states, shortcuts), mobile-first installable PWA with an offline add-queue, charts and insights, and a branded landing page with onboarding.

Forces at play: one developer working evenings; a strong test-automation background; the need to move between clouds without a rewrite; a public audience, so security and abuse-resistance matter from the first deploy; and a free-tier stage where compute sleeps and storage is small.

## Decision

Build a TypeScript monorepo with a Vue 3 frontend and a Hono backend, Postgres via Drizzle ORM, deployed as a container on Fly.io in Stage 1 and as a Cloudflare Worker (same Hono app) with Pages for static assets and Neon Postgres through Hyperdrive in Stage 2.

The one-sentence justification: Hono is the only mainstream backend framework that runs identically on Node (Fly) and on the Workers runtime (Cloudflare), and Drizzle is the ORM that speaks to Postgres from both, so the "two stages, one codebase" requirement is satisfied by framework choice rather than by abstraction layers written by hand.

## Options considered

### Option A: TypeScript — Vue 3 + Hono + Drizzle + Postgres (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one language, one toolchain (pnpm, Vite, Vitest, Playwright) |
| Cost | Free in Stage 1 (Fly free allowance + Fly Postgres or Neon free); ~£5/month on Cloudflare Workers paid + Neon free in Stage 2 |
| Scalability | Workers scale to zero and globally; Postgres is the ceiling, which is far above a personal-finance app's needs |
| Cloud portability | High — Hono adapters for Node, Bun, Workers, Lambda, Deno; Drizzle drivers for pg, Neon, Hyperdrive, D1 |
| Team familiarity | Vue known; Hono/Drizzle are small APIs, learnable in a day |

**Pros:** single language across app and tests; Hono runs on Cloudflare natively (no container needed in Stage 2); Playwright, Vitest and TypeScript types shared between frontend, backend and test packages; Drizzle migrations are plain SQL, readable in review.
**Cons:** Node ecosystem churn; Workers runtime lacks some Node APIs (no `fs`, limited crypto) so libraries must be chosen with Workers compatibility in mind from day one.

### Option B: Python — Vue 3 + FastAPI + SQLAlchemy + Postgres

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Free on Fly; Stage 2 on Cloudflare requires Cloudflare Containers (beta) or moving to another provider |
| Scalability | Fine |
| Cloud portability | Medium — containers run anywhere, but not natively on Workers |
| Team familiarity | High for the backend and pytest; two languages to maintain |

**Pros:** closest to the owner's automation-testing background; pytest ecosystem.
**Cons:** breaks the Stage 2 Cloudflare requirement unless Containers are used; two toolchains, two dependency trees, two sets of CI caches; Playwright-Python lags the Node version.

### Option C: Nuxt (full-stack Vue) with Nitro server

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low to start, higher when the server grows |
| Cost | Same as A |
| Scalability | Same as A |
| Cloud portability | High — Nitro has presets for Node and Cloudflare |
| Team familiarity | Vue known; Nuxt conventions to learn |

**Pros:** one framework, file-based routing, SSR for the landing page for free.
**Cons:** the API and the UI share a lifecycle and a deploy; API tests must boot Nuxt; the server layer is less explicit than Hono for a product whose backend (sync engine, rates, webhooks) is where most of the logic lives. Nuxt's Cloudflare preset is good but its server is not as portable as a plain Hono app.

## Trade-off analysis

The requirement that decides it is Stage 2 on Cloudflare. Option A runs there as a native Worker with the same code as Stage 1; Option B needs Containers; Option C works but couples the API to the UI framework. Between A and C, A keeps the backend — where the sync engine, currency logic and webhook handling live — as a plain, independently testable service, which matters more for this product than SSR convenience. The landing page still gets static pre-rendering through Vite (vite-ssg) without pulling the whole app into SSR.

Postgres over SQLite/D1: multi-user isolation, row-level constraints and JSON columns for connector state are easier in Postgres, and Neon's free tier plus Hyperdrive makes it as cheap on Cloudflare as D1. D1 remains available for edge caches if ever needed.

Sessions over JWTs: a public product with connector tokens behind it wants server-side sessions that can be revoked instantly. Sessions live in Postgres (Stage 1) and can move to Cloudflare KV in Stage 2 through one interface.

## Consequences

Easier: moving clouds (adapter swap + env vars), testing (one language, shared types, one Playwright), onboarding contributors (one `pnpm install`, one `docker compose up`).

Harder: library selection must respect the Workers runtime from the first commit (checked by a CI job that builds the Worker bundle on every PR, so drift is caught immediately). Long-running jobs (nightly rate fetch, Notion sync) run as a Fly scheduled machine in Stage 1 and as Cloudflare Cron Triggers in Stage 2; the job code is shared, only the trigger differs.

Revisit when: the Notion sync needs more than a few thousand rows per user (move sync to a queue: Fly machine + pg-boss, or Cloudflare Queues); Google Calendar is added (OAuth refresh-token storage and Google verification); a second developer joins (branch protection rules, CODEOWNERS).

---

# Implementation plan

## Repository layout

```
desk/
  apps/
    web/            Vue 3 + Vite + TypeScript + Pinia + vue-router; PWA via vite-plugin-pwa
    api/            Hono app; entry points: src/node.ts (Fly) and src/worker.ts (Cloudflare)
    landing/        vite-ssg static marketing site (can start as a route in web/)
  packages/
    db/             Drizzle schema, migrations, seed; drivers for pg and Neon/Hyperdrive
    core/           pure domain logic: money, currency conversion, budgets, categories, sync diff
    contracts/      zod schemas + generated OpenAPI; shared request/response types
    ui/             design tokens (CSS variables from the current dashboard), base components
    connectors/     notion/, rates/, (later) google-calendar/ — each with a real client and a fake
  tests/
    e2e/            Playwright projects: ci (mocked), local (real accounts, self-hosted runner)
    load/           k6 smoke script for the API
  infra/
    fly/            fly.toml, Dockerfile, scheduled machine config
    cloudflare/     wrangler.toml, Hyperdrive config, cron triggers
    docker-compose.yml   app + Postgres + mock connectors for local dev and CI
  .github/workflows/
    ci.yml          lint, typecheck, unit, contract, api, worker-build, e2e-ci
    e2e-local.yml   runs-on: self-hosted — real-browser and real-account suites
    deploy-fly.yml  on tag v* (Stage 1)
    deploy-cf.yml   on tag v* when STAGE=cloudflare (Stage 2)
  docs/adr/         this file and its successors
```

## Feature specifications (v1)

### F1 — Accounts and sessions
Sign-up and sign-in with email + password (Argon2id) and "Sign in with Google" (OIDC, `openid email profile` only — no Calendar scope yet). Email verification via a transactional provider (Resend free tier). Server-side sessions, HTTP-only cookies, CSRF token on mutations, rate limits on auth routes. Account deletion wipes all rows and revokes connector tokens.

Acceptance: a new user can register, verify, log in on two devices, log out one of them, and delete the account; every path has an API test and a Playwright test.

### F2 — Currency
Each user has a **default currency** (ISO 4217, chosen at sign-up, changeable in Settings). An expense stores `amount_original`, `currency_original`, `rate_to_default`, `rate_date`, `rate_source`, and `amount_default` (integer minor units, never floats). Rates come from the ECB via frankfurter.app (free, no key) with a nightly job that caches the full table per date in `fx_rates`; a request for a date not yet cached fetches on demand and stores it. Weekends and holidays resolve to the previous published rate, and the row records which date was used. Changing the default currency re-derives `amount_default` for every row from the stored original + a freshly fetched rate for each row's date, in a background job with progress shown in the UI. Users can override the rate on a single expense; the override is flagged.

Acceptance: property-based tests in `core` for rounding (banker's rounding on minor units, no drift on sums); contract tests against a recorded frankfurter response; an e2e test that enters EUR and EGP expenses on a GBP account and checks the totals.

### F3 — Expenses
CRUD with the fields from the current Notion table (what, amount, currency, date, category, paid-with, kind, notes) plus attachments later. Categories are per user with a seeded default set and a per-category monthly budget in the default currency. Month view with the three tiles, the category-versus-budget bars and the entries table from the current dashboard; a year view with month-over-month trends. Bulk CSV import (Monzo export format first, generic mapping second). Soft delete with a 30-day bin.

Acceptance: API tests for every route including authorisation (user A can never read user B's rows — a dedicated test suite); Playwright tests for add, edit, delete, import; visual regression snapshots for the charts.

### F4 — Notion sync (optional per user)
User connects Notion through Notion's public OAuth (not an internal integration), picks or lets the app create a database with the known schema, and chooses direction: app → Notion, Notion → app, or both. Two-way sync uses `last_edited_time` and a per-row `notion_page_id` with conflict rule "latest edit wins, both versions kept in an audit table". Runs every five minutes for connected users and immediately after an app-side write. Disconnecting keeps the data in both places.

Acceptance: sync engine tested in `core` against a fake Notion with scripted scenarios (create both sides, edit both sides, delete one side, rate-limit responses); an e2e test on the self-hosted runner against a real Notion test workspace.

### F5 — Auto-capture webhooks
A per-user webhook URL (`/hooks/monzo/<user token>`) that accepts Monzo `transaction.created`, dedupes on transaction id, maps Monzo categories to the user's categories (editable mapping in Settings), and creates the expense in the transaction's currency. A generic `/hooks/generic/<token>` that accepts `{amount, currency, date, description}` for MacroDroid-style phone automations.

Acceptance: contract tests with recorded Monzo payloads; replay-safety test (same payload twice → one row).

### F6 — Premium UI
Design system in `packages/ui` seeded from the current dashboard's tokens (IBM Plex Sans/Mono, the green accent, both themes) and extended with motion tokens and spacing scale. Skeletons on every panel, designed empty states, keyboard shortcuts (`n` new expense, `[`/`]` month), optimistic updates with undo toasts. PWA: installable, offline add-queue that syncs when back online, home-screen shortcut straight to the add form. Charts: monthly trend, category drill-down, budget forecast ("on track for £X"), built with a small SVG layer (no charting library) following the dataviz rules already used on the dashboard. Landing page with product name, logo, screenshots and a three-step onboarding (currency → first expense → optional Notion).

Acceptance: Lighthouse budget in CI (performance ≥ 90, accessibility ≥ 95, PWA installable); axe checks in Playwright; visual snapshots per component in both themes.

## Two-stage development and deployment

| | Stage 1 — validate | Stage 2 — production |
|---|---|---|
| Purpose | Test the app with real users for free | Paid, global, low-latency |
| Compute | Fly.io machine (shared-cpu-1x, sleeps when idle) running the Node entry point in a container | Cloudflare Worker running the Workers entry point; static assets on Cloudflare Pages |
| Database | Fly Postgres (single node) or Neon free | Neon Postgres via Hyperdrive (connection pooling at the edge) |
| Sessions | Postgres table | Cloudflare KV (same `SessionStore` interface) |
| Jobs | Fly scheduled machine (`fly machine run --schedule`) | Cloudflare Cron Triggers |
| Secrets | `fly secrets set` | `wrangler secret put` |
| Domain | `desk.fly.dev` | custom domain on Cloudflare, free TLS |
| Deploy trigger | git tag `v0.x.y` → `deploy-fly.yml` | git tag `v1.x.y` → `deploy-cf.yml` |
| Migration path | none needed | `pg_dump` from Fly → Neon; flip DNS; both stages can run in parallel for a week |

Environments: `local` (compose), `preview` (Fly app per PR, torn down on close — free at this scale), `staging` (Stage 1 app), `production` (Stage 2). Every environment is described only by environment variables listed in `.env.example`; the app refuses to start if a required variable is missing.

## Testing strategy and pipeline

Test pyramid, all in TypeScript:

1. **Unit** (Vitest, `packages/core`, `packages/ui`): money maths, conversion, sync diffing, date handling. Property-based tests with fast-check for rounding and sum invariants. Target: every exported function.
2. **Contract** (Vitest + recorded fixtures): each connector client tested against recorded real responses (frankfurter, Notion, Monzo); the fakes used elsewhere are validated against the same fixtures so mocks can't drift from reality.
3. **API** (Vitest + Hono test client + Testcontainers Postgres): every route, every auth/ownership rule, migrations applied from scratch on each run.
4. **Worker build**: `wrangler deploy --dry-run` on every PR so a Node-only dependency fails fast.
5. **E2E-CI** (Playwright, headless Chromium, compose stack with mock connectors): sign-up, add expense in two currencies, budgets, import, Notion sync against the fake, PWA install check, axe accessibility, Lighthouse budgets, visual snapshots. Deterministic: clock frozen, rates seeded.
6. **E2E-local** (Playwright on the self-hosted runner): real Notion test workspace, real Monzo sandbox payloads, Firefox/WebKit/Android Chrome via Playwright devices, the OAuth round-trips that need a real browser session. Runs on `workflow_dispatch` and nightly, never blocks a PR; failures open an issue automatically.
7. **Smoke after deploy**: hit `/healthz`, log in as a seeded test user, add and delete one expense; roll back the release if it fails (Fly: `fly releases rollback`; Cloudflare: `wrangler rollback`).

Self-hosted runner setup (one-time, ~10 minutes): GitHub → Settings → Actions → Runners → New self-hosted runner, install on the machine as a service, label it `desk-local`. Jobs in `e2e-local.yml` use `runs-on: [self-hosted, desk-local]`. Secrets for real accounts are stored as GitHub Environment secrets on an environment that requires the owner's approval, so a malicious PR cannot exfiltrate them. The runner is restricted to the repository and runs only on `main` and manual dispatch.

Definition of done for every feature PR: unit + API tests added, e2e-ci scenario added or updated, CHANGELOG entry, no drop in coverage (enforced at 85% lines for `core` and `api`), Lighthouse budgets green, PR template checklist ticked.

## Security baseline

Argon2id passwords, server-side sessions with rotation on login, CSRF double-submit, strict CSP with nonces, HSTS, rate limiting per IP and per account, connector tokens encrypted at rest (AES-GCM with a key from the environment; libsodium-compatible on Workers), audit table for connector actions, Dependabot + `pnpm audit` in CI, CodeQL on push, secret scanning enabled, `SECURITY.md` with a disclosure address, data export and deletion endpoints from v1 (UK GDPR), no analytics that identify users beyond a self-hosted, cookie-less counter.

## Milestones

| # | Milestone | Ends with |
|---|---|---|
| M0 | Foundation (1 week of evenings) | Monorepo, compose, CI green on an empty app, Fly preview deploy on PR, self-hosted runner registered, ADR-0001 accepted |
| M1 | Accounts + currency core (2 weeks) | F1, F2 core and settings; e2e-ci for sign-up and currency |
| M2 | Expenses (2 weeks) | F3 month view, CRUD, import; charts v1 |
| M3 | Notion sync + webhooks (2 weeks) | F4, F5; e2e-local against real Notion |
| M4 | Premium UI + PWA + landing (2 weeks) | F6; Lighthouse budgets; name and logo chosen |
| M5 | Stage 1 public beta | Tag v0.1.0, invite users, collect feedback for 2–4 weeks |
| M6 | Stage 2 cut-over | Cloudflare deploy, Neon migration, DNS flip, tag v1.0.0 |
| v2 | Mail and calendar panels (ADR-0004) | Per-connection OAuth, Google verification and CASA assessment, read-only panels across providers |

## Open items (decide during M0)

1. Product name and domain (needed before the landing page and the OAuth consent screens, which show it).
2. Transactional email provider (Resend vs Postmark) — both have free tiers; Resend has the simpler API.
3. Whether the Stage 1 database is Fly Postgres or Neon from the start (Neon from the start avoids the M6 migration; Fly Postgres keeps everything in one dashboard).
4. Licence for the repository (MIT if it should be open source; otherwise "All rights reserved" with a private repo).
5. Analytics choice: none, or a self-hosted Plausible-style counter.

## Action items

1. [ ] Rostom creates the GitHub repository (private) and adds Claude as a collaborator.
2. [ ] Claude scaffolds M0: monorepo, `docker-compose.yml`, CI workflows, Fly config, Dockerfile, `.env.example`, PR template, this ADR under `docs/adr/`.
3. [ ] Rostom creates the Fly.io account and a Cloudflare account; adds `FLY_API_TOKEN` and `CLOUDFLARE_API_TOKEN` as repository secrets.
4. [ ] Rostom registers the self-hosted runner and labels it `desk-local`.
5. [ ] Decide the five open items; record them in ADR-0002 (naming and providers).
6. [ ] Start M1.