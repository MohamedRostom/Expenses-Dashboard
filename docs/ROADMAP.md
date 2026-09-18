# Roadmap — Expenses Dashboard

Companion to `docs/adr/ADR-0001-platform-and-architecture.md`. The ADR says *what* and *why*; this file says *in what order*. Each phase ends in something deployed and usable, has its own exit criteria, and lists what only Rostom can do (accounts, secrets, approvals) separately from what can be built in code.

Phase numbering is what branch names, milestones and issues will use: `phase-0/…`, `phase-1/…`. Nothing from a later phase starts until the current phase's exit criteria are green in CI.

---

## Phase 0 — Foundation
**Goal:** an empty app that already builds, tests, previews and deploys, so every later phase inherits the pipeline instead of building it.
**Duration:** ~1 week of evenings.

**Build**
- pnpm monorepo: `apps/web` (Vue 3 + Vite + TS), `apps/api` (Hono with `node.ts` and `worker.ts` entry points), `packages/{core,contracts,db,ui,connectors}`, `tests/e2e`.
- Tooling: TypeScript strict, ESLint + Prettier, Vitest, Playwright, Husky pre-commit (lint + typecheck on staged files).
- `docker-compose.yml`: api, web (Vite dev server), Postgres 16, `mocks` container (empty for now).
- Drizzle set up with an initial migration (`users` table only) and a `pnpm db:migrate` script.
- `/healthz` route returning version + git SHA; web shows a "Hello" page reading it.
- Dockerfile (multi-stage, distroless runtime) and `infra/fly/fly.toml`.
- `wrangler.toml` and a CI job that runs `wrangler deploy --dry-run` to prove the Worker bundle builds.
- CI (`ci.yml`): lint → typecheck → unit → api (Testcontainers Postgres) → worker-build → e2e-ci (Playwright against compose).
- Fly preview app per PR (`deploy-preview.yml`), destroyed on PR close.
- `e2e-local.yml` skeleton with `runs-on: [self-hosted, desk-local]`, `workflow_dispatch` + nightly cron, approval-gated environment `local-secrets`.
- Repo hygiene: PR template with the definition-of-done checklist, CODEOWNERS, branch protection on `main` (CI required, no direct pushes), Dependabot, CodeQL, secret scanning, `SECURITY.md`, `.env.example` with startup validation (app refuses to boot if a variable is missing).
- `docs/adr/ADR-0001…` committed; `docs/adr/ADR-0002-naming-and-providers.md` drafted with the five open decisions.

**Rostom**
- Create Fly.io account → `FLY_API_TOKEN` repo secret.
- Create Cloudflare account → `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets.
- Register the self-hosted runner, label `desk-local`.
- Decide the five open items (name, email provider, Neon-from-day-one, licence, analytics) → ADR-0002 accepted.

**Tests introduced:** one unit test in `core`, one API test for `/healthz`, one Playwright test that loads the Hello page — all real, all in CI, so the pipeline is proven end to end.

**Exit criteria:** a PR that changes the Hello text gets a green CI run, a Fly preview URL in a PR comment, and merges to `main`; `main` deploys to `desk-staging.fly.dev`; the self-hosted runner shows online in GitHub.

---

## Phase 1 — Accounts and currency core
**Goal:** users exist, are isolated, and have a default currency; money maths is correct and locked down by tests before any expense is stored.
**Duration:** ~2 weeks.

**Build**
- F1 accounts: email + password (Argon2id), email verification (provider from ADR-0002), Google OIDC sign-in (`openid email profile` only), server-side sessions with rotation, CSRF, rate limits on auth routes, account deletion (cascading wipe), data export endpoint (JSON).
- Settings page: profile, default currency (ISO 4217 list with search), theme, delete account.
- F2 currency core in `packages/core`: `Money` type (integer minor units + currency), rounding rules, conversion with a stored rate, sum invariants.
- `connectors/rates`: frankfurter client + recorded fixtures + fake; nightly job to cache the day's table into `fx_rates`; on-demand fetch for uncached dates with weekend/holiday fallback recorded on the row.
- Jobs runner abstraction: one `runJob(name)` entry used by a Fly scheduled machine now and a Cloudflare cron later.
- `packages/ui` seeded with the dashboard's tokens (both themes, IBM Plex pairing), base components (Button, Input, Select, Dialog, Toast, Skeleton, EmptyState).

**Tests introduced:** property-based tests (fast-check) for rounding and conversion; auth API suite including the ownership matrix (every route × user A/user B); contract test for frankfurter; Playwright: sign-up → verify (mailpit in compose) → login on two contexts → logout one → delete account; axe on every page.

**Exit criteria:** a stranger can register on the staging URL and end up with an empty, isolated account in their chosen currency; coverage ≥ 85 % on `core` and `api`; ownership matrix has zero gaps.

---

## Phase 2 — Expenses
**Goal:** the product's core loop — add, see, understand — working on staging in multiple currencies.
**Duration:** ~2 weeks.

**Build**
- F3 data model: `expenses` (original amount/currency, rate, rate date, source, converted amount, override flag), `categories` (per user, seeded defaults, colour, monthly budget in default currency), soft delete + 30-day bin.
- API: CRUD, month and year queries, category budgets, CSV import (generic column mapping), rate override on a single expense, "change default currency" background job that re-derives every row with progress reporting.
- Web: month view ported from the current dashboard (three tiles, category-vs-budget bars, entries table, month switcher), add/edit form with currency picker defaulting to the user's currency, keyboard shortcuts (`n`, `[`, `]`), optimistic updates with undo toast, bin view, import wizard.
- Charts v1 as a small SVG layer following the dataviz rules already used on the dashboard: category bars, month-over-month trend.

**Tests introduced:** API suite for every route plus import edge cases (bad rows, duplicate rows, mixed currencies); Playwright: add GBP + EUR + EGP expenses on a GBP account and assert totals; edit/delete/restore; import a recorded sample CSV; visual snapshots of the charts in both themes; Lighthouse budget job (perf ≥ 90, a11y ≥ 95).

**Exit criteria:** Rostom uses staging for a full week of real expenses instead of the Notion table, in at least two currencies, without a data fix.

---

## Phase 3 — Notion sync and auto-capture
**Goal:** the two ways data gets in without typing: Notion two-way sync and webhooks.
**Duration:** ~2 weeks.

**Build**
- F4 Notion: Notion public OAuth (not an internal integration), connector token encrypted at rest, database picker or "create one for me" with the known schema, direction choice, sync engine in `core` (diff by `last_edited_time` + `notion_page_id`, latest-edit-wins with an audit table), scheduled run every 5 min for connected users + immediate run after app-side writes, disconnect keeps data both sides.
- F5 webhooks: per-user `/hooks/generic/<token>` for phone automations (dedupe on a client-supplied id, category mapping editable in Settings, currency from the payload); token rotation in Settings. Bank webhooks are excluded from v1 (ADR-0003).
- Connectors page in Settings showing status, last sync, errors, and a "sync now" button.

**Tests introduced:** sync engine scenario suite against the fake Notion (create both sides, edit both sides, delete one side, rate-limited responses, clock skew); webhook contract tests with recorded generic payloads and replay safety; **first e2e-local suite** on the self-hosted runner against a real Notion test workspace, nightly.

**Exit criteria:** an expense added in the app appears in a connected Notion database within 5 minutes and vice versa; a replayed generic payload never creates a second row; nightly e2e-local is green three nights running.

---

## Phase 4 — Premium UI, PWA, landing page
**Goal:** the product looks and feels finished, works from a phone, and can be explained to a stranger.
**Duration:** ~2 weeks.

**Build**
- F6 polish: motion tokens and transitions on state changes, skeletons everywhere, designed empty states, command palette (`⌘K`) for navigation and quick add, responsive layouts audited at 360 px.
- PWA: `vite-plugin-pwa`, manifest with the product name and icon, offline add-queue (IndexedDB) that flushes on reconnect, home-screen shortcut to the add form, install prompt.
- Insights: year view, category drill-down, budget forecast ("on track for £X"), month comparison.
- Landing page (`apps/landing`, vite-ssg): name, logo, screenshots, three-step onboarding (currency → first expense → optional Notion), privacy page, terms.
- Onboarding flow inside the app for first login.

**Tests introduced:** Playwright device projects (Pixel, iPhone viewports) in e2e-ci; PWA installability check; offline test (go offline → add → go online → row exists); visual snapshots per component in both themes; Lighthouse PWA category added to the budget.

**Exit criteria:** installable on Rostom's phone with a two-tap add; Lighthouse all four categories ≥ 90 on landing and app; three people outside the project can sign up from the landing page without help.

**`needs-rostom`:** SC-006 (three observed outside sign-ups from the landing page) and SC-009 (a returning user logs an expense on a mid-range phone in 15 seconds over a real network) require real people and cannot be run by an agent. Not yet run — no date, no pass/fail recorded. Run these before the Phase 4 PR is merged and record the date and result in that PR description per `specs/001-phased-product-baseline/tasks.md` T123.

---

## Phase 5 — Stage 1 public beta (Fly.io)
**Goal:** real users on the free tier; learn what breaks.
**Duration:** 2–4 weeks of running, little building.

**Build**
- Tag `v0.1.0`; `deploy-fly.yml` promotes the tagged image to `staging` → smoke test → `production` app on Fly.
- Observability: structured JSON logs, error tracking (Sentry free tier or GlitchTip), uptime check on `/healthz`, weekly usage digest to Rostom.
- Feedback widget in the app; issue template for user reports.
- Backups: nightly `pg_dump` to Cloudflare R2 (free) with a restore drill documented in `docs/runbooks/restore.md`.

**Rostom:** invite users, triage feedback into Phase 6 / v2 issues, watch Fly's free allowance.

**Exit criteria:** 30 days without a P1 incident; restore drill performed once successfully; a prioritised backlog exists for v2.

---

## Phase 6 — Stage 2 cut-over (Cloudflare)
**Goal:** move to paid, global infrastructure with zero data loss and no rewrite.
**Duration:** ~1 week plus a week of parallel running.

**Build**
- `worker.ts` entry wired to Hyperdrive (Neon Postgres), sessions on Cloudflare KV via the existing `SessionStore` interface, jobs on Cron Triggers, static assets on Cloudflare Pages, custom domain with free TLS.
- `deploy-cf.yml` triggered by `v1.*` tags.
- Migration runbook: `pg_dump` Fly → Neon (or skip if Neon was chosen in Phase 0), read-only window, DNS flip, both stages running in parallel for a week, Fly app scaled to zero afterwards.

**Tests introduced:** the full e2e-ci suite runs against the Cloudflare preview deployment before the flip; post-deploy smoke on the new domain.

**Exit criteria:** tag `v1.0.0` live on the custom domain; Fly app scaled to zero; Stage 1 kept for 30 days as rollback, then deleted.

---

## v2 (after Phase 6) — Calendar and beyond
Not scheduled; captured so Phase 1's OAuth design leaves room for it.
- Mail and calendar panels (ADR-0004, spec `specs/002-mail-calendar-panels/`): per-connection refresh-token storage, Google OAuth verification, the "next 7 days" calendar panel and a read-only inbox panel across Google, Microsoft and standards-based providers; Google mail last, after the restricted-scope CASA assessment.
- Shared budgets (two users, one category set) — depends on the multi-user isolation done right in Phase 1.
- Receipt attachments (R2 storage) and OCR of amounts.
- Bank feeds via Open Banking (provider to be chosen; no bank integration in v1 per ADR-0003).

---

## Cross-phase rules

- **Definition of done** for every PR: unit + API tests, e2e-ci scenario, CHANGELOG line, coverage not lower, Lighthouse budgets green, PR checklist ticked, preview URL visited by the author.
- **Testing that cannot run in the cloud** (real accounts, real browsers on real devices, OAuth round-trips) goes into `e2e-local.yml` on the `desk-local` runner: nightly and on demand, never blocking a PR, failures open an issue automatically.
- **Two-stage rule:** any library added must pass the `worker-build` job; if it can't, it is wrapped behind an interface with a Workers-compatible implementation before merge, not "later".
- **Feature flags** (a `flags` table read per request) gate anything shipped early: Gmail-style panels, experimental charts, v2 work merged before it is announced.
- **Issue tracking:** one GitHub milestone per phase, one issue per bullet above, labels `phase-N`, `area:web|api|core|infra|tests`, `needs-rostom` for the items only he can do.