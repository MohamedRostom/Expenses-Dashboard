<p align="center">
  <img src="docs/assets/banner.svg" alt="Desk — Expenses Dashboard" width="100%">
</p>

# Desk (working name) — Expenses Dashboard

<p align="center">
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/ci.yml/badge.svg?branch=main"></a>
<br>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/deploy-staging.yml"><img alt="Deploy staging" src="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/deploy-staging.yml/badge.svg?branch=main"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/deploy-preview.yml"><img alt="Deploy preview" src="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/deploy-preview.yml/badge.svg"></a>
<br>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/e2e-local.yml"><img alt="e2e-local" src="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/e2e-local.yml/badge.svg"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/MohamedRostom/Expenses-Dashboard/actions/workflows/codeql.yml/badge.svg"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/network/updates"><img alt="Dependabot" src="https://img.shields.io/badge/dependabot-enabled-025e8c?logo=dependabot&logoColor=white"></a>
<br>
<a href="package.json"><img alt="Version" src="https://img.shields.io/github/package-json/v/MohamedRostom/Expenses-Dashboard?label=version"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/releases"><img alt="Release" src="https://img.shields.io/github/v/release/MohamedRostom/Expenses-Dashboard?include_prereleases&label=release"></a>
<a href="package.json"><img alt="Node" src="https://img.shields.io/badge/node-22_LTS-339933?logo=node.js&logoColor=white"></a>
<a href="pnpm-workspace.yaml"><img alt="pnpm" src="https://img.shields.io/badge/pnpm-12-F69220?logo=pnpm&logoColor=white"></a>
<br>
<a href="tsconfig.base.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white"></a>
<a href="apps/web"><img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white"></a>
<a href="apps/api"><img alt="Hono" src="https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white"></a>
<a href="packages/db"><img alt="Drizzle" src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black"></a>
<a href="infra/docker-compose.yml"><img alt="Postgres" src="https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white"></a>
<br>
<a href="infra/fly"><img alt="Fly.io" src="https://img.shields.io/badge/Stage_1-Fly.io-8B5CF6?logo=flydotio&logoColor=white"></a>
<a href="infra/cloudflare"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Stage_2-Cloudflare_Workers-F38020?logo=cloudflareworkers&logoColor=white"></a>
<a href="package.json"><img alt="Vitest" src="https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white"></a>
<a href="tests/e2e"><img alt="Playwright" src="https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white"></a>
<a href="#testing-rules"><img alt="Coverage floor" src="https://img.shields.io/badge/coverage_floor-85%25-1f6e5a"></a>
<a href="https://www.conventionalcommits.org/"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional_Commits-1.0.0-FE5196?logo=conventionalcommits&logoColor=white"></a>
<br>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/MohamedRostom/Expenses-Dashboard"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/MohamedRostom/Expenses-Dashboard/main"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/graphs/commit-activity"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/MohamedRostom/Expenses-Dashboard"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/MohamedRostom/Expenses-Dashboard"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/pulls"><img alt="Open PRs" src="https://img.shields.io/github/issues-pr/MohamedRostom/Expenses-Dashboard"></a>
<a href="https://github.com/MohamedRostom/Expenses-Dashboard/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/MohamedRostom/Expenses-Dashboard"></a>
<a href="SECURITY.md"><img alt="Security policy" src="https://img.shields.io/badge/security-policy-1f6e5a"></a>
</p>

A public, multi-user, multi-currency expense tracker with optional two-way Notion sync and webhook auto-capture from phone automations. It is the productised rewrite of a personal claude.ai dashboard; the personal dashboard stays in use and is not part of this repo.

"Desk" is a placeholder until a product name is decided (ADR-0002). Use it in code; do not invent another.

Read `CLAUDE.md` for the decisions, `docs/ROADMAP.md` for what comes next, `docs/adr/` for why, and `LOCAL_DEVELOPMENT.md` for a step-by-step local setup.

## Status

Phase 0 (foundation) is scaffolded and merged: monorepo, `/healthz` + Hello page, `users` migration, compose stack, Fly and Cloudflare configs, CI, preview and staging deploys, CodeQL, Dependabot, secret scanning, branch protection. Phase 0 closes once the Fly/Cloudflare secrets and the `desk-local` runner exist (see "Open items"). Phase 1 (`phase-1/accounts`) starts with the `Money` type and its property-based tests.

Specs for the next features live in `specs/` (Spec Kit format: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`):

| Spec | What | Ships |
| --- | --- | --- |
| `001-phased-product-baseline` | Baseline for every phase, F1–F6 | v1, via `phase-N/…` branches |
| `002-mail-calendar-panels` | Read-only mail + calendar panels across Google, Microsoft and standards-based providers (ADR-0004) | v2; Google mail gated on CASA |
| `003-dashboard-widgets` | Weather, sunrise, place search, currency widgets on Open-Meteo (ADR-0005) | v2 |
| `004-web-ui-refresh` | Design tokens, blocks and landing page refresh | v2 |

## Roadmap

| Phase | Goal |
| --- | --- |
| 0 — Foundation | Empty app that builds, tests, previews and deploys |
| 1 — Accounts and currency core | Email/password + Google sign-in, sessions, isolation, `Money`, FX rates |
| 2 — Expenses | Add, list, month view, categories, budgets, multi-currency |
| 3 — Notion sync and auto-capture | Public-OAuth Notion sync, generic webhook, column-mapped import |
| 4 — Premium UI, PWA, landing page | Design system port, `vite-plugin-pwa`, `vite-ssg` landing |
| 5 — Stage 1 public beta | Fly.io |
| 6 — Stage 2 cut-over | Cloudflare Workers + Pages + KV + Neon via Hyperdrive |

Each phase has exit criteria in `docs/ROADMAP.md`; nothing from a later phase starts before the current one is green.

## Stack and decisions

Everything is TypeScript on Node 22 with pnpm workspaces. These are settled; reopening one needs an ADR.

- **Frontend:** Vue 3 + Vite + Pinia + vue-router. PWA via `vite-plugin-pwa`, landing page via `vite-ssg`.
- **Backend:** Hono, one app object with two entry points — `apps/api/src/node.ts` (Fly.io container, Stage 1) and `apps/api/src/worker.ts` (Cloudflare Workers, Stage 2). Every dependency must survive `wrangler deploy --dry-run`; if it can't, wrap it behind an interface with a Workers-compatible implementation.
- **Database:** Postgres 16 through Drizzle ORM. Migrations are SQL files in `packages/db/migrations`, applied on start. Stage 2 uses Neon through Cloudflare Hyperdrive.
- **Sessions:** server-side, HTTP-only cookies, CSRF double-submit. `SessionStore` interface: Postgres now, Cloudflare KV later.
- **Auth:** email + password (Argon2id) and Google OIDC with `openid email profile` only. Connector scopes (Notion, and in v2 mail/calendar) are granted per connection, never on the sign-in grant.
- **Source of truth:** the app's own database. Notion is an optional per-user two-way sync through Notion's public OAuth (API version `2025-09-03`, data sources).
- **Money:** integer minor units, never floats. Each expense stores `amount_original`, `currency_original`, `rate_to_default`, `rate_date`, `rate_source`, `amount_default`, `rate_overridden`. Rates come from frankfurter.app (ECB), cached daily in `fx_rates`; weekends and holidays fall back to the last published rate and record which date was used. Changing the default currency re-derives every row in a background job.
- **Hosting:** Stage 1 Fly.io (staging at `ros-desk-staging.fly.dev`, a preview app per PR). Stage 2 Cloudflare.
- **Not in v1:** bank integrations of any kind (ADR-0003) — only the generic webhook and column-mapped import.
- **Rejected:** Python/FastAPI (no native Cloudflare path), Nuxt (couples API to UI), GitHub Pages (no server for secrets).

### Open items (Rostom's call — ADR-0002)

Product name, transactional email provider, Neon from day one or Stage 2 only, licence, analytics. Until ADR-0002 is accepted treat these as undecided.

## Repository layout

```
.
├── apps
│   ├── api                  Hono API
│   │   ├── src
│   │   │   ├── app.ts       app object shared by both entries
│   │   │   ├── env.ts       startup validation (refuses to boot on missing vars)
│   │   │   ├── node.ts      Stage 1 entry — Fly.io container
│   │   │   └── worker.ts    Stage 2 entry — Cloudflare Workers
│   │   └── test             healthz, env, migrations, worker
│   └── web                  Vue 3 + Vite
│       └── src
│           ├── router.ts
│           └── views/HelloView.vue
├── packages
│   ├── core                 pure domain logic, no I/O (month-key today; Money next)
│   ├── contracts            zod schemas + shared types
│   ├── db                   Drizzle schema, migrations/, migrate CLI
│   ├── ui                   design tokens (tokens.css) + base components
│   └── connectors           notion/, rates/ — real client + fake + recorded fixtures
├── tests
│   └── e2e                  Playwright: projects `ci` (mocked) and `local` (real accounts)
├── infra
│   ├── docker-compose.yml   api + web + postgres + mailpit + mocks
│   ├── fly                  Dockerfile (multi-stage), fly.toml
│   └── cloudflare           wrangler.toml
├── docs
│   ├── ROADMAP.md
│   ├── adr                  ADR-0001 … ADR-0005
│   └── assets               banner.svg
├── specs                    Spec Kit feature specs 001–004
├── .github
│   └── workflows            ci, deploy-preview, deploy-staging, e2e-local, codeql
├── CLAUDE.md                project memory and decisions
├── LOCAL_DEVELOPMENT.md
├── CHANGELOG.md
├── SECURITY.md
└── package.json             pnpm workspace root
```

Planned but not yet created: `apps/landing` (vite-ssg), `tests/load` (k6 smoke).

## Development

Requires Node 22 and pnpm 12 (`npm i -g pnpm@12`). Docker Desktop for Postgres, the compose stack and the API tests. `LOCAL_DEVELOPMENT.md` has the long version with troubleshooting.

### First-time setup

```sh
git clone https://github.com/MohamedRostom/Expenses-Dashboard.git
cd Expenses-Dashboard
pnpm install
cp .env.example .env               # defaults match the compose stack
```

`.env.example` lists every variable the Node entry point reads (`DATABASE_URL` required; `PORT` and `GIT_SHA` optional). `apps/api/src/env.ts` refuses to boot if a required one is missing; the Worker validates its bindings through the same schema.

### Option A — dev servers on the host, Postgres in Docker

Fastest loop: Vite HMR and API restarts run natively, only the database is containerised.

```sh
docker compose -f infra/docker-compose.yml up -d postgres   # start Postgres only
pnpm db:migrate                                              # apply packages/db/migrations
pnpm dev                                                     # api :3000, web :5173 (proxies /healthz)
```

Stop with `Ctrl+C`, then `docker compose -f infra/docker-compose.yml stop postgres` when you are done for the day.

### Option B — whole stack in containers

What CI's e2e job sees: api, web, postgres, mailpit and the mocks container.

```sh
docker compose -f infra/docker-compose.yml up --build --wait   # foreground, add -d to detach
```

### Docker cheat sheet

All commands take `-f infra/docker-compose.yml`; alias it once with `alias dc='docker compose -f infra/docker-compose.yml'`.

| Task | Command |
| --- | --- |
| Start everything in the background | `dc up -d --build` |
| Start one service | `dc up -d postgres` |
| Status | `dc ps` |
| Follow logs (all / one service) | `dc logs -f` / `dc logs -f api` |
| Rebuild after a dependency or Dockerfile change | `dc up -d --build api` |
| Restart a service | `dc restart api` |
| Stop, keep data | `dc stop` |
| Stop and remove containers, keep data | `dc down` |
| Stop and wipe the database | `dc down -v` |
| Shell into a container | `dc exec api sh` |
| Postgres console | `dc exec postgres psql -U desk -d desk` |

`.env` defaults (`postgres://desk:desk@localhost:5432/desk`) point at the compose Postgres, so Option A and Option B share the same database.

### Database

```sh
pnpm db:migrate                    # apply pending SQL migrations from packages/db/migrations
pnpm db:generate                   # drizzle-kit: diff packages/db/src/schema.ts → new migration file
dc down -v && dc up -d postgres && pnpm db:migrate   # reset from scratch
```

Migrations are plain SQL, committed, and applied on API start in every environment. Never edit an applied migration; add a new one.

### Check it

```sh
pnpm lint && pnpm typecheck        # also run on staged files by the Husky pre-commit hook
pnpm format                        # prettier --write
pnpm test:unit                     # packages/core, Vitest, coverage floor 85 %
pnpm test:api                      # apps/api, Vitest + Testcontainers Postgres (needs Docker)
pnpm worker:build                  # wrangler deploy --dry-run: proves the Worker bundle
pnpm test:e2e --project=ci         # Playwright against the compose stack on :5173
pnpm test                          # core + api together
```

Run a single package or file directly: `pnpm --filter @desk/core test -- month-key`, `pnpm --filter @desk/api test -- healthz`. Coverage reports land in `packages/core/coverage/` and `apps/api/coverage/`.

Without Docker you can still run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` and `pnpm worker:build`; `test:api` and `test:e2e` need Postgres.

### Branch workflow

```sh
git checkout -b phase-N/short-description    # or feature/NNN-slug for spec work
# ... commit with Conventional Commits, add a CHANGELOG.md line ...
```

Every PR needs the checks above green, an e2e-ci scenario, coverage not lower and the PR template ticked; CI then posts a Fly preview URL to visit before review.

## CI and deploys

`ci.yml` runs on every PR: `detect-changes` → `lint` → `typecheck` → `unit` → `api` → `worker-build` (→ e2e-ci). Branch protection on `main` requires the CI jobs and blocks direct pushes. `deploy-preview.yml` deploys a Fly app per PR and destroys it on close; `deploy-staging.yml` deploys `main` to `ros-desk-staging.fly.dev`. `codeql.yml` and Dependabot run on a schedule.

`e2e-local.yml` covers anything that needs real accounts, real devices or OAuth round-trips. It runs on a self-hosted runner labelled `desk-local`, on `workflow_dispatch` and nightly, only on `main`, with secrets in the approval-gated `local-secrets` environment. It never blocks a PR.

Repo secrets needed: `FLY_API_TOKEN`, `PREVIEW_DATABASE_URL`, `STAGING_DATABASE_URL` (Phase 0); `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (Phase 6 — the dry-run is unauthenticated).

## Testing rules

The pyramid is all TypeScript: unit (Vitest; property-based with fast-check for money), contract (recorded fixtures per connector, fakes validated against the same fixtures), API (Hono test client + Testcontainers Postgres), worker-build, e2e-ci (compose stack, mocked connectors, frozen clock, seeded rates, axe, Lighthouse perf ≥ 90 / a11y ≥ 95), e2e-local, and a post-deploy smoke.

Two rules have no exceptions: every route is tested for user A vs user B isolation (the ownership matrix), and coverage stays at or above 85 % lines on `core` and `api`.

Definition of done per PR: unit + API tests, an e2e-ci scenario, a `CHANGELOG.md` line, coverage not lower, Lighthouse green, PR checklist ticked, preview URL visited.

## Design system

Ported from the personal dashboard. IBM Plex Sans for body, IBM Plex Mono with `tabular-nums` for numbers. Accent green `#1f6e5a` (light) / `#5fbf9f` (dark); backgrounds `#f2f4f7` / `#121820`; status colours warn `#a8641a`, critical `#a83a2e` — never reused as chart series. Three theme states: bare `:root` is light, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Charts are a small hand-written SVG layer (no chart library) with a table view always available. Every panel has skeleton, empty and error states, and error copy branches on the error code.

Default categories: Rent, Council tax, Utilities, Internet, Phone, Subscriptions, Groceries, Eating out, Transport, Cycling, Gym & health, Personal care, Clothing, Entertainment, Household, Driving lessons, Travel, Other. Fixed-kind by default: Rent, Council tax, Utilities, Internet, Phone, Subscriptions, Gym & health.

## Conventions

Branches `phase-N/short-description` (feature specs use `feature/NNN-slug`), one GitHub milestone per phase, labels `phase-N`, `area:web|api|core|infra|tests`, `needs-rostom`. Conventional Commits. `CHANGELOG.md` follows Keep a Changelog. Feature flags (`flags` table) gate any user-facing feature merged before it is announced (a change to the look of existing screens needs no flag, constitution 1.1.1). Never commit secrets. Prefer prose over bullet walls in docs; decisions go in ADRs.

## Documents

- `docs/adr/ADR-0001-platform-and-architecture.md` — stack, options considered, F1–F6 feature specs, testing strategy, security baseline
- `docs/adr/ADR-0002-naming-and-providers.md` — the five open decisions (draft)
- `docs/adr/ADR-0003-no-bank-integration-in-v1.md`
- `docs/adr/ADR-0004-mail-and-calendar-panels.md` — v2 read-only mail and calendar
- `docs/adr/ADR-0005-weather-source.md` — Open-Meteo, CC-BY attribution, revisit before monetisation
- `docs/ROADMAP.md` — phases 0–6 with exit criteria
- `SECURITY.md` — private vulnerability reporting
- `LOCAL_DEVELOPMENT.md` — full local setup and troubleshooting

## Licence

MIT — see `LICENSE`.
