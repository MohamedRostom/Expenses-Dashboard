<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles: none
- Modified sections: Development Workflow and Quality Gates (new rule: no push, pull
  request, merge or other publication without the owner's explicit instruction; local
  commits remain allowed)
- Added sections: none
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no changes made here
- Follow-up TODOs: mirror the rule in CLAUDE.md "Conventions" (separate change)
-->

# Desk Constitution

Desk is the working name of the Expenses Dashboard: a public, multi-user, multi-currency
expense tracker with optional two-way Notion sync and webhook auto-capture. This document
states the principles every change MUST satisfy. Decisions made under these principles live in
`docs/adr/`; the order of work lives in `docs/ROADMAP.md`; `CLAUDE.md` is the working summary
kept in sync with both.

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

Every behaviour change starts with a failing test. The author writes the test, watches it
fail, then writes the code that makes it pass; a PR whose test was added after the code is
rejected in review. Reviewers read the test before the change. The pyramid is fixed and all
TypeScript: unit (Vitest, property-based with fast-check for money), contract (recorded
fixtures per connector, fakes validated against the same fixtures), API (Vitest + Hono test
client + Testcontainers Postgres with migrations from scratch), worker-build, e2e-ci
(Playwright against the compose stack with mocked connectors, frozen clock, seeded rates, axe
and Lighthouse budgets), e2e-local (real accounts on the `desk-local` runner, nightly and on
demand, never blocking a PR) and post-deploy smoke. Coverage MUST NOT fall below 85 % lines on
`packages/core` and `apps/api`. Every route MUST have an ownership-matrix test proving user A
cannot see user B's data. Rationale: the owner reviews as a test engineer and the product
handles money; a test that arrives after the code proves nothing about the reasoning that
produced it.

### II. One Codebase, Two Runtimes

The same Hono app object MUST run unchanged on Node (Stage 1, Fly.io) and on Cloudflare
Workers (Stage 2). `apps/api/src/node.ts` and `apps/api/src/worker.ts` differ only in adapters
and bindings. Any dependency MUST pass the `worker-build` CI job (`wrangler deploy --dry-run`)
before merge; one that cannot MUST be wrapped behind an interface with a Workers-compatible
implementation in the same PR, never "later". Sessions, jobs and storage go through interfaces
(`SessionStore`, `runJob`) so the Stage 2 cut-over is a configuration change, not a rewrite.
Rationale: the move from free-tier validation to paid global infrastructure is planned, and
drift is cheapest to catch on the commit that introduces it.

### III. Money Is Exact

Money is stored and computed as integer minor units with an ISO 4217 currency; floats are
never used for amounts. Each expense keeps `amount_original`, `currency_original`,
`rate_to_default`, `rate_date`, `rate_source`, `amount_default` and `rate_overridden`, so a
converted figure never drifts from the rate that produced it. Rates come from frankfurter.app
(ECB), are cached per date in `fx_rates`, and a weekend or holiday lookup MUST record which
published date was actually used. Rounding rules and sum invariants MUST be covered by
property-based tests. Changing a user's default currency re-derives every row in a background
job with visible progress. Rationale: an expense tracker that is off by a penny is wrong, and
wrongness that appears only in reports is the hardest to find.

### IV. Every User Is an Island

The app's own Postgres database is the source of truth; Notion and webhooks are optional
inputs per user, never dependencies. Every row is owned by exactly one user and every query is
scoped by that owner. Authentication is email + password (Argon2id) or Google OIDC with
`openid email profile` only; no Calendar or Gmail scopes in v1. Sessions are server-side,
HTTP-only cookies with CSRF double-submit and rotation on login. Connector tokens are encrypted
at rest, connector actions are audited, and every user can export (JSON) and delete (cascading
wipe) their data from v1. Rationale: a public product with third-party tokens behind it must be
safe for strangers on day one, and isolation retrofitted later is never complete.

### V. Decide Once, Write It Down

Architectural and product decisions are recorded as ADRs in `docs/adr/` and summarised in
`CLAUDE.md`; a decision already made MUST NOT be reopened without a new ADR. Open decisions are
marked as open (currently the five items in ADR-0002) and the agent or contributor MUST ask
rather than guess when a decision is the owner's: naming, providers, spending money, anything
touching real accounts. The working name "Desk" is used in code until a product name is chosen;
nobody invents one. Every PR adds a `CHANGELOG.md` line. Rationale: one developer working
evenings cannot afford to re-derive context; the documents are the memory.

### VI. Simplicity and Finished Surfaces

Build the smallest thing that satisfies the test: no speculative abstractions, no interface with
a single implementation unless Principle II requires it, no configuration for values that never
change, no new dependency where a few lines or a platform feature will do. Anything merged
before it is announced sits behind a feature flag in the `flags` table. What ships MUST look
finished: every panel has skeleton, empty and error states; error copy branches on the error
code, never one generic banner; charts are a small hand-written SVG layer following the
project's dataviz rules; design tokens (IBM Plex Sans/Mono, the green accent, three theme
states) come from `packages/ui`, not from ad-hoc CSS. Rationale: complexity is paid for at 3 am,
and a half-finished surface costs more trust than a missing one.

## Platform and Security Constraints

Language and toolchain are fixed by ADR-0001: TypeScript everywhere, Node 22 LTS, pnpm
workspaces, Vue 3 + Vite + Pinia + vue-router for the web app (PWA via `vite-plugin-pwa`,
landing page via `vite-ssg`), Hono for the API, Postgres 16 through Drizzle ORM with SQL
migrations applied on start, Vitest and Playwright for tests. Rejected alternatives
(Python/FastAPI, Nuxt, GitHub Pages hosting) are not revisited without an ADR.

Hosting is two-stage: Fly.io free allowance for staging and per-PR previews, then Cloudflare
Workers + Pages + KV + Cron Triggers with Neon Postgres via Hyperdrive. Every environment is
described only by environment variables listed in `.env.example`, and the app MUST refuse to
boot when a required variable is missing. Secrets are never committed; real-account secrets live
in the approval-gated GitHub environment `local-secrets` and are used only from `main`.

The security baseline is mandatory, not aspirational: Argon2id, server-side sessions, CSRF,
strict CSP with nonces, HSTS, rate limiting per IP and per account, AES-GCM encryption of
connector tokens, Dependabot, CodeQL and secret scanning where the repository plan allows them,
`SECURITY.md` with a disclosure route, and no analytics that identify users beyond a
self-hosted, cookie-less counter if one is ever adopted (ADR-0002).

## Development Workflow and Quality Gates

Work is organised by the phases in `docs/ROADMAP.md`: branches `phase-N/short-description`, one
GitHub milestone per phase, labels `phase-N`, `area:web|api|core|infra|tests` and `needs-rostom`.
Nothing from a later phase starts until the current phase's exit criteria are green in CI.
Commits follow Conventional Commits and carry the attribution lines the CLI adds.

Nothing is pushed to the remote unless the owner has said so explicitly for that push. An
agent or contributor MAY commit locally at any time, but MUST NOT run a push, open a pull
request, merge, or otherwise publish commits without an explicit instruction naming that
action; a general request to "fix", "implement" or "finish" something is not such an
instruction. Rationale: a push is outward-facing and triggers CI, previews and deploys; the
owner decides when work leaves the machine.

CI on every PR runs, in order, lint, typecheck, unit, api (Testcontainers Postgres),
worker-build and e2e-ci; a Fly preview app is deployed per PR and destroyed on close; `main`
deploys to staging. The definition of done for every PR is: unit and API tests added, an e2e-ci
scenario added or updated, a `CHANGELOG.md` line, coverage not lower than `main`, Lighthouse
budgets green (performance >= 90, accessibility >= 95) where a page changed, the PR checklist
ticked, and the preview URL visited by the author. Review follows the owner's style: the test
that proves the change is presented before the change itself; adding a dependency that is not
Workers-compatible requires asking first; anything else is decided and documented.

## Governance

This constitution takes precedence over every other practice document in the repository.
When documents conflict the order is: this constitution, then accepted ADRs in `docs/adr/`,
then `CLAUDE.md`. A conflict discovered in a lower document is fixed there, not tolerated.

Amendments are made by a pull request that edits this file and adds or updates an ADR under
`docs/adr/` explaining the change; only Rostom merges it. The version follows semantic
versioning: MAJOR for removing or redefining a principle in a backward-incompatible way, MINOR
for adding a principle or section or materially expanding guidance, PATCH for clarifications
and wording. Each amendment updates the Sync Impact Report at the top of this file and the
"Last Amended" date.

Compliance is checked in every PR review against the definition of done above; any added
complexity (a new abstraction, dependency or service) MUST be justified in the PR description
against Principle VI. `CLAUDE.md` is the runtime guidance file for agents and contributors and
MUST be updated in the same PR as any decision that changes it.

**Version**: 1.1.0 | **Ratified**: 2026-09-16 | **Last Amended**: 2026-09-17
