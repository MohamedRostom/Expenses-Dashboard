# Implementation Plan: Phased Product Baseline

**Branch**: `001-phased-product-baseline` (spec); code lands on `phase-N/*` branches | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-phased-product-baseline/spec.md`

## Summary

Desk is a multi-user, multi-currency expense tracker delivered in six phases on top of the
Phase 0 foundation already open as PR #1. The plan keeps one Hono application object running on
Node (Fly.io) now and Cloudflare Workers later, Vue 3 in front, Postgres through Drizzle behind,
and pushes every domain rule (money, conversion, budgets, sync diffing, import fingerprints) into
`packages/core` where it is unit- and property-tested with no I/O. Every runtime-specific
concern (password hashing, sessions, rate limiting, mail, jobs, secrets) sits behind a small
interface with a Workers-compatible implementation chosen up front, so Phase 6 is a binding
swap, not a rewrite. Research resolved every technical unknown; the five product decisions in
ADR-0002 remain the owner's and are planned with stated defaults.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 22 LTS, pnpm 12 workspaces

**Primary Dependencies**: Vue 3.5 + Vite 8 + Pinia + vue-router (web), Hono 4 (API, Node and
Workers adapters), Drizzle ORM 0.45 + postgres.js (data), zod 4 (contracts), fast-check
(property tests), vite-plugin-pwa (PWA), vite-ssg (landing). Added per phase and each must pass
`worker-build`: hash-wasm (Argon2id), jose (OIDC token verification), papaparse (CSV),
@axe-core/playwright and @lhci/cli (quality gates). See [research.md](research.md).

**Storage**: Postgres 16 via Drizzle SQL migrations applied on start; Stage 1 Fly Postgres or
Neon (ADR-0002 item 3, Neon assumed), Stage 2 Neon through Cloudflare Hyperdrive. Sessions in
Postgres now, Cloudflare KV later, through `SessionStore`. Browser: IndexedDB for the offline
add-queue only.

**Testing**: Vitest (unit + API with Testcontainers Postgres), fast-check, recorded-fixture
contract tests per connector, `wrangler deploy --dry-run`, Playwright (`ci` against compose with
mocks, `local` on the `desk-local` runner), axe and Lighthouse budgets in e2e-ci.

**Target Platform**: Stage 1 Linux container on Fly.io (distroless Node 22); Stage 2 Cloudflare
Workers + Pages; browsers: evergreen desktop and mobile, installable PWA at 360 px and up.

**Project Type**: Web application monorepo (SPA + API + shared packages).

**Performance Goals**: month and year views under 1 s with 20,000 expenses for one user; import
of 1,000 rows under 1 min; Lighthouse performance >= 90 and accessibility >= 95; capture-to-row
under 1 min; Notion propagation under 5 min; phone add under 15 s from unlock.

**Constraints**: money as integer minor units only; every dependency Workers-compatible or
wrapped; app refuses to boot on missing env; 85 % line coverage on core and api; ownership
matrix on every route; 99.5 % monthly availability, nightly backups, 4 h restore; English UI,
locale-formatted numbers, ISO currency codes always shown; no bank integration (ADR-0003).

**Scale/Scope**: 1,000 users, 20,000 expenses and five years of history per user, roughly 15
screens, 6 phases; feature flags gate anything merged before announcement.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status before research | Status after design |
|-----------|------|------------------------|---------------------|
| I. Test-First | Every story in the spec has an independent test; plan names the test layer for each requirement; coverage floor and ownership matrix scheduled in Phase 1 before any expense route exists | Pass | Pass (quickstart.md lists the proving test per phase) |
| II. One Codebase, Two Runtimes | Every new dependency listed above has a Workers-compatible path; runtime concerns are behind interfaces named in research.md | Pass | Pass (SessionStore, PasswordHasher, Mailer, RateLimiter, JobRunner, SecretBox, Logger) |
| III. Money Is Exact | `Money` type, ISO 4217 exponent table and half-even rounding live in core with property tests; expense rows carry the seven conversion fields | Pass | Pass (data-model.md expenses table) |
| IV. Every User Is an Island | Every table with user data has `user_id` with cascade delete; every route reads the user from the session and scopes by it; export and delete endpoints in Phase 1 | Pass | Pass (contracts/api.md; ownership matrix test in quickstart) |
| V. Decide Once, Write It Down | Open decisions reference ADR-0002; bank removal recorded as ADR-0003; no new decision taken here without a documented default | Pass | Pass (research.md marks owner decisions as pending with defaults) |
| VI. Simplicity and Finished Surfaces | No abstraction without a second implementation planned within the roadmap; charts hand-written; states for every panel; flags table | Pass | Pass (Complexity Tracking empty) |

## Project Structure

### Documentation (this feature)

```text
specs/001-phased-product-baseline/
├── plan.md              # This file
├── research.md          # Phase 0 output: decisions with rationale and alternatives
├── data-model.md        # Phase 1 output: tables, constraints, state transitions
├── quickstart.md        # Phase 1 output: how to prove each phase end to end
├── contracts/
│   ├── api.md           # HTTP API surface by phase (zod schemas live in packages/contracts)
│   └── generic-webhook.md  # Capture address contract for phone automations
└── tasks.md             # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
apps/
├── web/                 # Vue 3 SPA: src/views (Hello, Auth, Month, Year, Settings, Import,
│                        #   Bin, Onboarding), src/components, src/stores (Pinia), src/offline
│                        #   (IndexedDB add-queue), src/api (typed client from @desk/contracts)
├── api/                 # Hono app: src/app.ts, src/node.ts, src/worker.ts, src/env.ts,
│                        #   src/routes/{auth,users,expenses,categories,rates,imports,notion,
│                        #   hooks,flags,feedback}.ts, src/middleware/{session,csrf,ratelimit,
│                        #   secure-headers}.ts, src/adapters/{node,worker}/*, test/
└── landing/             # vite-ssg marketing site (Phase 4)

packages/
├── core/                # Money, currencies (ISO 4217 exponents), conversion, budgets,
│                        #   month-key, import fingerprint, sync diff, forecast; no I/O
├── contracts/           # zod request/response schemas per route, generated OpenAPI
├── db/                  # Drizzle schema, SQL migrations, seed, migrate CLI
├── ui/                  # tokens.css, base components, SVG chart primitives
└── connectors/
    ├── rates/           # frankfurter client, fake, recorded fixtures
    └── notion/          # Notion client (2025-09-03), fake, recorded fixtures

tests/
├── e2e/                 # Playwright: tests/*.spec.ts, projects ci and local
└── load/                # k6 smoke (Phase 5)

infra/
├── fly/                 # Dockerfile, fly.toml, scheduled machine for jobs
├── cloudflare/          # wrangler.toml, Hyperdrive, KV, cron triggers (Phase 6)
├── mocks/               # Hono mock server for frankfurter + Notion used by compose/e2e-ci
└── docker-compose.yml   # api, web, postgres, mailpit, mocks
```

**Structure Decision**: the Phase 0 monorepo is kept and grown in place. Domain logic goes to
`packages/core` first (tested without I/O), route handlers in `apps/api/src/routes` stay thin
and call core plus Drizzle, and runtime-specific code lives only in `apps/api/src/adapters`.
`infra/mocks` replaces the empty `mocks` compose service from Phase 1 onward.

## Phase Delivery Map

| Roadmap phase | Spec stories | New surface | Proving tests (see quickstart.md) |
|---------------|--------------|-------------|-----------------------------------|
| 1 Accounts and currency core | US1 | auth routes, sessions, CSRF, rate limits, settings, export, delete; `Money`, currencies, conversion; rates connector + nightly warm job; ui tokens and base components | property tests for Money; auth API suite with ownership matrix; frankfurter contract test; Playwright sign-up → verify (Mailpit) → two contexts → logout → delete; axe |
| 2 Expenses | US2, US3, US4 | expenses, categories, budgets, month/year queries, import with mapping and fingerprints, rate override, currency-change job with progress; month view, form, shortcuts, bin, import wizard; SVG charts | API suite per route incl. import edge cases; Playwright multi-currency totals, edit/delete/restore, import twice; chart snapshots both themes; Lighthouse job |
| 3 Notion sync and capture | US5, US6 | Notion OAuth, connection settings, sync engine in core, 5-minute job + post-write trigger, versions table; generic capture address with rotation and receipts | sync scenario suite against the fake; webhook replay tests; first e2e-local nightly against a real Notion workspace |
| 4 App experience and insight | US7, US8, US9 | PWA manifest, offline add-queue with idempotent ids, onboarding, command palette, year view, drill-down, forecast, landing site | Playwright device projects; offline add test; PWA installability; visual snapshots; Lighthouse PWA category |
| 5 Beta operations | US10 | feedback endpoint and widget, structured logs, error tracking, uptime check, nightly backup to R2, restore runbook, k6 smoke, `v0.1.0` tag and promote workflow | post-deploy smoke; restore drill documented and executed |
| 6 Cloudflare cut-over | US10 | worker bindings (Hyperdrive, KV sessions, cron), Pages for static assets, custom domain, `deploy-cf.yml` on `v1.*`, migration runbook | full e2e-ci against the Cloudflare preview; smoke on the new domain; per-user totals before and after |

## Complexity Tracking

No constitution violations to justify. Each interface listed under Principle II has a second
implementation scheduled within the roadmap (Postgres now, KV/Workers later), so none is an
abstraction with a single implementation.
