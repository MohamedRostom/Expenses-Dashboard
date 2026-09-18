# Tasks: Phased Product Baseline

**Input**: Design documents from `/specs/001-phased-product-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/generic-webhook.md, quickstart.md, `.specify/memory/constitution.md`

**Tests**: Included and mandatory. Constitution Principle I requires strict red-green TDD, so every story phase lists its tests first; each test task must be written and seen failing before the implementation tasks that follow it. Coverage floor 85 % lines on `packages/core` and `apps/api`; the ownership matrix test must cover every route before a phase ships.

**Organization**: Setup and Foundational phases, then one phase per user story in spec priority order (US1 to US10), then Polish. Roadmap phases map onto story phases: roadmap Phase 1 = US1, Phase 2 = US2 to US4, Phase 3 = US5 and US6, Phase 4 = US7 to US9, Phases 5 and 6 = US10. Each roadmap phase ships on its own `phase-N/...` branch and PR set, in the order below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 to US10)
- Include exact file paths in descriptions

## Path Conventions

Monorepo per plan.md: `apps/web`, `apps/api`, `apps/landing`, `packages/{core,contracts,db,ui,connectors}`, `tests/e2e`, `tests/load`, `infra/{fly,cloudflare,mocks}`. Phase 0 (PR #1) already provides the workspace, `/healthz`, the `users` table, CI and deploy workflows.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Land the planning set and grow the Phase 0 skeleton to the layout the plan needs.

- [x] T001 Planning set committed on this branch (2026-09-17); the delivery branch starts from it
- [x] T002 [P] Create `infra/mocks/` as a workspace package `@desk/mocks` (`package.json`, `tsconfig.json`, `src/server.ts` Hono app on :4000 with `GET /clock` and `POST /clock` for a frozen clock) and add `mocks` service (`build: {context: .., target: deps}`, `command: pnpm --filter @desk/mocks start`) replacing the alpine placeholder in `infra/docker-compose.yml`
- [x] T003 [P] Add `mailpit` service (`axllent/mailpit`, ports 1025 and 8025) to `infra/docker-compose.yml` and `SMTP_URL=smtp://mailpit:1025` to the `api` service environment
- [x] T004 [P] Add `fast-check` to `packages/core` devDependencies and `@axe-core/playwright` to `tests/e2e` devDependencies; verify `pnpm worker:build` still passes
- [x] T005 [P] Create `packages/connectors/rates/` and `packages/connectors/notion/` folders with `index.ts`, `fake.ts`, `fixtures/` and update `packages/connectors/package.json` exports (`./rates`, `./notion`)
- [x] T006 [P] Extend `.env.example` with every variable named in quickstart.md (`SESSION_SECRET`, `SECRET_BOX_KEY`, `RESEND_API_KEY`, `SMTP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `APP_ORIGIN`, `TEST_MODE`) with one-line comments
- [x] T007 Add `pnpm jobs:tick` script (`apps/api/src/jobs/tick.ts` entry, runs `runDueJobs()` once and exits) to `apps/api/package.json` and a Fly scheduled machine note in `infra/fly/fly.toml` comments

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain money core, runtime interfaces with Workers-compatible implementations, Phase 1 schema, API middleware and test harnesses that every story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Money core (tests first)

- [x] T008 [P] Write failing property tests in `packages/core/src/money/money.test.ts`: `Money` rejects non-safe integers and zero, parse/format round-trip for every currency in the ISO 4217 table, sums are exact integers
- [x] T009 [P] Write failing property tests in `packages/core/src/money/convert.test.ts`: half-even rounding fixtures (0.5 cases both directions), `convert(sum) - sum(convert)` within one minor unit per row, exponent changes 0/2/3
- [x] T010 Implement `packages/core/src/money/currencies.ts` (ISO 4217 code, name, exponent table) and `packages/core/src/money/money.ts` (`Money`, `parseMajor`, `formatMajor`, `add`, `negate`)
- [x] T011 Implement `packages/core/src/money/convert.ts` (`convert(money, rate: string, to)` using scaled-integer multiplication and `roundHalfEven`) and export all from `packages/core/src/index.ts`

### Runtime interfaces (Principle II)

- [x] T012 [P] Write failing tests in `apps/api/test/adapters/password.test.ts` (hash verifies, wrong password fails, `needsRehash` on changed params) and implement `PasswordHasher` interface in `apps/api/src/adapters/password.ts` with `hash-wasm` Argon2id (19 MiB, 2 iterations, parallelism 1)
- [x] T013 [P] Write failing tests in `apps/api/test/adapters/session-store.test.ts` (create/get/touch/revoke/revokeAllExcept, expiry = min(lastSeen+30d, created+90d)) and implement `SessionStore` interface plus `PgSessionStore` in `apps/api/src/adapters/session-store.ts`
- [x] T014 [P] Write failing tests in `apps/api/test/adapters/rate-limiter.test.ts` (fixed window, per key, prune) and implement `RateLimiter` interface plus `PgRateLimiter` in `apps/api/src/adapters/rate-limiter.ts`
- [x] T015 [P] Write failing tests in `apps/api/test/adapters/mailer.test.ts` (capturing fake records `to`, `subject`, links) and implement `Mailer` interface with `ResendMailer` (fetch) and `SmtpMailer` (Node-only, Mailpit) plus `CapturingMailer` in `apps/api/src/adapters/mailer.ts`
- [x] T016 [P] Write failing tests in `apps/api/test/adapters/secret-box.test.ts` (AES-256-GCM seal/open round-trip, tamper fails) and implement `SecretBox` in `apps/api/src/adapters/secret-box.ts` using WebCrypto
- [x] T017 [P] Implement `Logger` (one JSON line per event to stdout with request id, hashed user id, route, status, duration) in `apps/api/src/adapters/logger.ts` and a `requestLogger` middleware in `apps/api/src/middleware/request-logger.ts` with a test in `apps/api/test/adapters/logger.test.ts` asserting one parseable JSON line per request with those fields and no raw user id
- [x] T018 Write failing tests in `apps/api/test/jobs/runner.test.ts` (claim with SKIP LOCKED, progress, retry up to 5, cancel by user) and implement `JobRunner` (`enqueue`, `runDueJobs`, `cancelForUser`) in `apps/api/src/jobs/runner.ts` with a `jobs` registry in `apps/api/src/jobs/index.ts`

### Schema and contracts

- [x] T019 Extend `packages/db/src/schema.ts` with Phase 1 tables from data-model.md (`users` columns `email_verified_at`, `password_hash`, `default_currency`, `theme`, `time_zone`, `onboarding_completed_at`; `oauth_accounts`, `sessions`, `email_tokens`, `rate_limits`, `fx_rates`, `jobs`, `flags`, `user_flags`, `audit_log`) with cascade deletes and indexes, then `pnpm db:generate --name accounts`
- [x] T019a Create `packages/db/src/seed.ts` (idempotent: flag rows with `default_on = false`, the e2e seeded user and, behind `--load`, one user with 20,000 expenses across five years for SC-010) with `pnpm db:seed` in `packages/db/package.json`, run by the compose `api` service after `db:migrate` and by the e2e-ci job; later specs add their own rows to this file
- [x] T020 [P] Add the error envelope schema and codes (`validation_failed`, `unauthenticated`, `not_found`, `rate_limited`, `conflict`, `rate_unavailable`) to `packages/contracts/src/errors.ts` and export
- [x] T021 [P] Extend `apps/api/src/env.ts` schema with the new variables from T006 (required: `SESSION_SECRET`, `SECRET_BOX_KEY`, `APP_ORIGIN`; provider keys optional but validated as a group) and update `apps/api/test/env.test.ts`

### API middleware and test harness

- [x] T022 Implement `apps/api/src/middleware/session.ts` (reads `__Host-desk_session`, loads user, sets `c.var.user`), `apps/api/src/middleware/csrf.ts` (double-submit on non-GET), `apps/api/src/middleware/errors.ts` (maps thrown `ApiError` and zod errors to the envelope) and wire them in `apps/api/src/app.ts` with a `createApp(deps)` signature taking db, hasher, sessions, limiter, mailer, secretBox, rates, jobs, clock
- [x] T023 Implement `apps/api/src/middleware/secure-headers.ts` (Hono `secureHeaders` with per-request nonce, HSTS) and nonce injection into `index.html` in `apps/api/src/node.ts` static serving; set Vite `html.cspNonce` in `apps/web/vite.config.ts`
- [x] T024 Create the API test harness `apps/api/test/harness.ts`: starts one Testcontainers Postgres per file, runs migrations, builds `createApp` with fakes (CapturingMailer, fake rates, frozen clock), exposes `asUser(email)` returning a client with cookie and CSRF header
- [x] T025 [P] Create the ownership matrix scaffold `apps/api/test/ownership.test.ts` that iterates a `routes` table (method, path, body factory) as user A against user B's ids and asserts `not_found` or empty; initially covers `/me`, `/me/sessions/:id`, `/jobs/:id`
- [x] T026 [P] Create Playwright fixtures in `tests/e2e/fixtures/index.ts` (`signUpAndVerify(page, email)` via Mailpit API at :8025, `freezeClock(date)` via mocks :4000, `axeCheck(page)`) and `tests/e2e/fixtures/sample-export.csv`
- [x] T027 [P] Seed `packages/ui`: base components `Button.vue`, `Input.vue`, `Select.vue`, `Dialog.vue`, `Toast.vue`, `Skeleton.vue`, `EmptyState.vue`, `ErrorState.vue` in `packages/ui/src/components/` using `tokens.css`, exported from `packages/ui/src/index.ts`
- [x] T028 [P] Add `apps/web/src/api/client.ts` (typed fetch wrapper that sends the CSRF header, parses the error envelope, throws `ApiError`) and `apps/web/src/stores/session.ts` (Pinia store with `user`, `load`, `logout`)
- [x] T029 Add `apps/web/src/router.ts` guards (`requiresAuth` redirect to `/login`) and route stubs for `/login`, `/register`, `/verify`, `/forgot`, `/reset`, `/settings`, `/`, `/year`, `/import`, `/bin`, `/onboarding`

**Checkpoint**: Foundation ready. `pnpm test` green with coverage on core and api; e2e-ci still passes with the Hello page.

---

## Phase 3: User Story 1 - Own an isolated account in my currency (Priority: P1) 🎯 MVP

**Goal**: Register (email or Google), verify, sign in on two devices, manage sessions, change currency and theme, export, delete; every row invisible to other users. Roadmap Phase 1, branch `phase-1/accounts`.

**Independent Test**: two users in separate browsers, zero cross-visibility on every route; delete user A and nothing remains.

### Tests for User Story 1

- [x] T030 [P] [US1] Write failing API tests in `apps/api/test/auth.test.ts`: register returns 202 always, verify sets session, login rotates session, wrong password 401, lockout after 10 attempts per email in 15 min and 100 per IP per hour with "Too many attempts" message, logout revokes, password 12 to 128 chars and breached-list refusal
- [x] T031 [P] [US1] Write failing API tests in `apps/api/test/password-reset.test.ts`: forgot returns 202 always, reset link single use and 20 min expiry, reset revokes other sessions, expired/used link error shape
- [x] T032 [P] [US1] Write failing API tests in `apps/api/test/google.test.ts` using a stubbed discovery and JWKS: new user created, verified email links to password account, unverified email refused, remove-last-method refused
- [x] T033 [P] [US1] Write failing API tests in `apps/api/test/me.test.ts`: `GET /me`, `PATCH /me` theme and currency (enqueues `currency.change`), email change via new-address link with notice to old, sessions list and single revoke, `GET /me/export` document shape, `DELETE /me` cascades every table and pseudonymises audit rows, unverified user purge after 7 days via `housekeeping`, a second currency change requested while one is running queues behind it and returns the running job id (single progress indicator)
- [x] T034 [P] [US1] Write failing contract test `packages/connectors/rates/frankfurter.test.ts` replaying recorded fixtures (weekday, weekend fallback with returned date, unsupported currency) against both `FrankfurterRates` and `FakeRates`
- [x] T035 [P] [US1] Write failing Playwright test `tests/e2e/tests/auth.spec.ts`: sign up, read verification link in Mailpit, sign in on two contexts, sign out one, reset password, delete account, axe on every page
- [x] T036 [US1] Extend `apps/api/test/ownership.test.ts` routes table with every Phase 1 route from contracts/api.md

### Implementation for User Story 1

- [x] T037 [P] [US1] Add zod schemas for auth, me, sessions, export, currencies, jobs, flags in `packages/contracts/src/auth.ts`, `packages/contracts/src/me.ts`, `packages/contracts/src/jobs.ts`
- [x] T038 [P] [US1] Implement `packages/connectors/rates/frankfurter.ts` (`RatesProvider.rate(date, from, to)` returning `{rate, rateDate, source}`, seven-day fallback window, `unsupported` result), `packages/connectors/rates/fake.ts` seeded from `fixtures/`, and the `fx_rates` cache wrapper `apps/api/src/services/rates.ts`
- [x] T039 [US1] Implement `apps/api/src/services/auth.ts` (register with breached-list check via k-anonymity range lookup behind a `BreachChecker` interface with a fake, verify, login, logout, forgot, reset, email change) writing `email_tokens` and audit rows
- [x] T040 [US1] Implement `apps/api/src/routes/auth.ts` for `/auth/register`, `/auth/verify`, `/auth/login`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset` with rate limits (per email, per IP) and mail templates in `apps/api/src/mail/verify.ts`, `apps/api/src/mail/reset.ts`, `apps/api/src/mail/email-change.ts`
- [x] T041 [US1] Implement Google PKCE flow in `apps/api/src/routes/google.ts` (`/auth/google/start`, `/auth/google/callback`) with `jose` ID token verification and `oauth_accounts` linking rules
- [x] T042 [US1] Implement `apps/api/src/routes/me.ts` (`GET/PATCH /me`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `GET /me/export` streaming JSON, `DELETE /me` in one transaction cancelling jobs first, `POST /me/email`, `POST /me/email/confirm`, `DELETE /me/password`, `DELETE /me/oauth/:provider`) and `apps/api/src/routes/misc.ts` (`GET /currencies`, `GET /jobs/:id`, `GET /flags`)
- [x] T042a [US1] Implement the operator flag switch `packages/db/src/flags-cli.ts` (`pnpm flags set <key> --user <email>|--global on|off`, writes `flags` / `user_flags`, effective on the next request) with a test in `apps/api/test/flags.test.ts` proving `GET /flags` reflects the change without a restart
- [x] T043 [US1] Implement jobs `currency.change` (batches of 500, budgets converted once at change-date rate, progress) in `apps/api/src/jobs/currency-change.ts`, `rates.warm` and `rates.retry` in `apps/api/src/jobs/rates.ts`, and `housekeeping` (prune rate_limits, purge unverified users after 7 days, purge audit/versions after 12 months) in `apps/api/src/jobs/housekeeping.ts`
- [x] T044 [P] [US1] Build web views `apps/web/src/views/RegisterView.vue`, `LoginView.vue`, `VerifyView.vue`, `ForgotView.vue`, `ResetView.vue` (expired/used link states offer a new link) using `packages/ui` components and the currency picker `apps/web/src/components/CurrencyPicker.vue` with search over `/currencies`
- [x] T045 [US1] Build `apps/web/src/views/SettingsView.vue` (profile, email change, default currency with job progress polling `/jobs/:id`, theme system/light/dark applied via `data-theme`, sessions list with revoke, export download, delete account with confirmation screen)
- [x] T046 [US1] Add `apps/api/test/ownership.test.ts` to the `api` CI job's required checks and confirm coverage >= 85 % on `packages/core` and `apps/api` via `vitest.config.ts` thresholds

**Checkpoint**: a stranger registers on staging and lands in an empty account in their currency; SC-002 met.

---

## Phase 4: User Story 2 - Add, see and understand expenses in any currency (Priority: P1)

**Goal**: Expense CRUD with exact multi-currency conversion, month view, bin, rate override, shortcuts. Roadmap Phase 2, branch `phase-2/expenses`.

**Independent Test**: GBP account, add GBP, EUR (weekday) and EGP (Sunday) expenses; month total equals the integer sum; originals retained; Sunday row shows the rate date.

### Tests for User Story 2

- [x] T047 [P] [US2] Write failing core tests in `packages/core/src/month-summary.test.ts`: totals exclude pending and binned rows, remaining may be negative, categories without budget count in spent only, year equals sum of months
- [x] T048 [P] [US2] Write failing API tests in `apps/api/test/expenses.test.ts`: create with client UUID v7 is idempotent, same-currency rate 1/source none, weekend fallback records rate date, seven-day gap leaves pending, later-date provider answer leaves pending, unsupported currency pending with note, zero amount rejected, future date > 1 year rejected, override retains fetched rate and clearing restores it, soft delete/restore/purge after 30 days, cursor pagination at 500
- [x] T049 [P] [US2] Write failing API tests in `apps/api/test/summary.test.ts`: `/summary/month` tiles, per-category over-budget, pending count; `/summary/year`; `/rates` preview
- [x] T050 [P] [US2] Write failing Playwright test `tests/e2e/tests/expenses.spec.ts`: three-currency totals, Sunday rate date visible, edit, delete, restore from bin, shortcuts `n` `[` `]`, ISO code shown on every amount, locale formatting
- [x] T051 [US2] Extend `apps/api/test/ownership.test.ts` with every expense, summary and rates route

### Implementation for User Story 2

- [x] T052 [P] [US2] Extend `packages/db/src/schema.ts` with `categories` and `expenses` per data-model.md (indexes, unique notion_page_id, cascade) and `pnpm db:generate --name expenses`
- [x] T053 [P] [US2] Add zod schemas in `packages/contracts/src/expenses.ts` (create/patch bodies with `amount: {minor, currency}`, list query, summary responses) and `packages/contracts/src/rates.ts`
- [x] T054 [P] [US2] Implement `packages/core/src/month-summary.ts` (tiles, per-category spend vs budget, over-budget flag, pending count) and `packages/core/src/year-summary.ts`
- [x] T055 [US2] Implement `apps/api/src/services/expenses.ts` (create/update with conversion via `services/rates.ts`, override, soft delete, restore, purge) and `apps/api/src/routes/expenses.ts` for `GET/POST /expenses`, `PATCH/DELETE /expenses/:id`, `POST /expenses/:id/restore`
- [x] T056 [US2] Implement `apps/api/src/routes/summary.ts` (`/summary/month`, `/summary/year`) and `apps/api/src/routes/rates.ts` (`GET /rates`)
- [x] T057 [P] [US2] Build `packages/ui/src/charts/CategoryBars.vue` (single hue, budget tick marks, critical fill when over budget) and `packages/ui/src/charts/DataTable.vue` (table alternative rendered alongside)
- [x] T058 [US2] Build `apps/web/src/views/MonthView.vue` (three tiles, category bars, entries table, month switcher, pending-rate count, skeleton/empty/error states) with `apps/web/src/stores/expenses.ts` and keyboard shortcuts in `apps/web/src/composables/useShortcuts.ts`
- [x] T059 [US2] Build `apps/web/src/components/ExpenseForm.vue` (currency picker defaulting to user currency, live conversion preview via `/rates`, rate override field, optimistic save with undo toast) and `apps/web/src/views/BinView.vue`
- [x] T060 [US2] Add `apps/web/src/utils/format.ts` (locale number and date formatting via `Intl`, ISO code always appended) with unit tests in `apps/web/src/utils/format.test.ts`

**Checkpoint**: SC-003 achievable on staging; SC-010 checked with a seeded 20,000-expense user (`packages/db/src/seed.ts`).

---

## Phase 5: User Story 3 - Budget by category and watch the month (Priority: P2)

**Goal**: Category management with budgets and the over-budget state. Roadmap Phase 2.

**Independent Test**: 100 GBP Groceries budget, 80 then 30 spent; second entry flips to over budget and remaining goes negative.

### Tests for User Story 3

- [x] T061 [P] [US3] Write failing API tests in `apps/api/test/categories.test.ts`: seeded 18 defaults with fixed kinds on sign-up, rename/recolour/archive, delete reassigns to "Other", "Other" undeletable, budget applies to any month, archived categories leave budget tiles, budgets converted and flagged on currency change
- [x] T062 [P] [US3] Write failing Playwright test `tests/e2e/tests/budgets.spec.ts`: over-budget bar and table state, negative remaining tile, month-over-month trend visible

### Implementation for User Story 3

- [x] T063 [P] [US3] Add category schemas in `packages/contracts/src/categories.ts` and the default category seed list in `packages/core/src/categories.ts`
- [x] T064 [US3] Implement `apps/api/src/services/categories.ts` (seed on sign-up hook from T039, CRUD, archive, reassign-then-delete) and `apps/api/src/routes/categories.ts`; extend ownership matrix
- [x] T065 [US3] Build `apps/web/src/views/CategoriesView.vue` (list, colour, kind, budget editor, archive, review-budgets banner after a currency change) and `packages/ui/src/charts/TrendSparkline.vue` wired into `MonthView.vue`

**Checkpoint**: Stories 1 to 3 usable together on staging.

---

## Phase 6: User Story 4 - Bring in history from a file (Priority: P2)

**Goal**: Column-mapped spreadsheet import with preview, per-row fixes, duplicate detection and undo. Roadmap Phase 2.

**Independent Test**: import the sample export twice with zero new rows the second time; malformed date row reported and skipped; undo after editing one row bins all batch rows and reports the edited count.

### Tests for User Story 4

- [x] T066 [P] [US4] Write failing core tests in `packages/core/src/import/fingerprint.test.ts` (normalisation: lowercase, trim, punctuation removed, whitespace collapsed; property: same row same fingerprint) and `packages/core/src/import/parse-row.test.ts` (date formats, decimal separators, too many decimals, unknown currency errors)
- [x] T067 [P] [US4] Write failing API tests in `apps/api/test/imports.test.ts`: UTF-8 with and without BOM, comma/semicolon/tab detection, 5 MB and 10,000-row limits, preview creates nothing, commit with skips and fixes, duplicates by mapped id and by fingerprint, undo bins edited rows and reports count, profiles CRUD, and a timed case: 1,000 rows with `FakeRates` pre-cached previews and commits in under 60 s (SC-004)
- [x] T068 [P] [US4] Write failing Playwright test `tests/e2e/tests/import.spec.ts` with `tests/e2e/fixtures/sample-export.csv`: map columns, preview, commit, re-import reports duplicates, undo

### Implementation for User Story 4

- [x] T069 [P] [US4] Extend `packages/db/src/schema.ts` with `import_profiles`, `import_batches`, `import_rows` and `pnpm db:generate --name imports`
- [x] T070 [P] [US4] Implement `packages/core/src/import/fingerprint.ts` and `packages/core/src/import/parse-row.ts` (mapping definition type, row parsing to `Money` and date, error codes)
- [x] T071 [US4] Implement `apps/api/src/services/imports.ts` (papaparse with delimiter detection and limits, preview into `import_rows`, duplicate check against expenses and external ids, commit, undo) and `apps/api/src/routes/imports.ts` (`/imports/profiles`, `POST /imports`, `/imports/:id/commit`, `/imports/:id/undo`); extend ownership matrix
- [x] T072 [US4] Build `apps/web/src/views/ImportView.vue` wizard (upload, column mapping with saved profiles, preview table with per-row status and inline fixes, commit summary, undo)

**Checkpoint**: Roadmap Phase 2 exit criteria met; tag nothing yet.

---

## Phase 7: User Story 5 - Keep a Notion table in step, both ways (Priority: P2)

**Goal**: Notion public OAuth, table pick/create with the known layout, direction, five-minute two-way sync with change history. Roadmap Phase 3, branch `phase-3/notion-capture`.

**Independent Test**: connected test workspace, add on each side, both present once within five minutes; concurrent edits keep both versions with the later one winning.

### Tests for User Story 5

- [x] T073 [P] [US5] Write failing core scenario tests in `packages/core/src/sync/diff.test.ts`: create both sides, edit both sides, delete one side, clock skew, tie goes to Desk, invalid remote row skipped, first sync imports existing rows when Notion is a source, direction change semantics, full reconcile on switch to both
- [x] T074 [P] [US5] Write failing contract test `packages/connectors/notion/client.test.ts` replaying recorded 2025-09-03 fixtures (data source query with cursor, page create/update/archive, 429 with Retry-After, 401 revoked) against `NotionClient` and `FakeNotion`
- [ ] T075 [P] [US5] Write failing API tests in `apps/api/test/notion.test.ts`: OAuth callback stores encrypted token, databases listing with compatibility check, create database with known layout, connection PUT/DELETE keeps rows and links, sync job runs and writes `expense_versions`, error state on revoked token, sync-now debounce, reconnecting to the same table resumes the links and to a different table starts fresh (FR-014)
- [ ] T076 [P] [US5] Write failing e2e-local test `tests/e2e/tests/notion.spec.ts` tagged `@local` (three trials per direction, five-minute wait, versions visible)

### Implementation for User Story 5

- [x] T077 [P] [US5] Extend `packages/db/src/schema.ts` with `notion_connections` and `expense_versions` and `pnpm db:generate --name notion`
- [x] T078 [P] [US5] Implement `packages/connectors/notion/client.ts` (API version 2025-09-03, token bucket 3 rps, Retry-After handling, known layout constant with Expense ID property, `ensureLayout`), `packages/connectors/notion/fake.ts` and fixtures
- [x] T079 [P] [US5] Implement `packages/core/src/sync/diff.ts` (pure `diff(local, remote, cursor, direction)` returning `toNotion`, `toLocal`, `conflicts`, `skipped`) and field mapping in `packages/core/src/sync/mapping.ts`
- [ ] T080 [US5] Implement `apps/api/src/services/notion.ts` (OAuth start/callback with SecretBox, list databases, create database, apply diff in a transaction writing versions, status transitions) and job `notion.sync` in `apps/api/src/jobs/notion-sync.ts` (every 5 min per connected user plus debounced trigger after expense writes)
- [ ] T081 [US5] Implement `apps/api/src/routes/notion.ts` (`/notion/start`, `/notion/callback`, `GET/PUT/DELETE /notion/connection`, `/notion/databases`, `POST /notion/sync`, `GET /expenses/:id/versions`); extend ownership matrix
- [ ] T082 [US5] Build `apps/web/src/views/ConnectorsView.vue` (connect, pick or create table, direction, status with last sync and errors including skipped rows, sync now, disconnect) and `apps/web/src/components/VersionHistory.vue` on the expense form
- [ ] T083 [US5] Add the `mocks` Notion fake routes to `infra/mocks/src/server.ts` and point `NOTION_API_BASE` at it in `infra/docker-compose.yml`; extend `.env.example`

**Checkpoint**: e2e-local nightly green three nights (SC-005).

---

## Phase 8: User Story 6 - Capture spending without typing (Priority: P2)

**Goal**: One active secret capture address per user with rotation, replay safety, label mapping and rate limit. Roadmap Phase 3.

**Independent Test**: same message twice yields one row with the mapped category; foreign-currency message keeps its currency; rotated address refuses the old one.

### Tests for User Story 6

- [x] T084 [P] [US6] Write failing API tests in `apps/api/test/hooks.test.ts` per contracts/generic-webhook.md: 201 create with `addedVia = phone`, 200 duplicate by id, duplicate by body-plus-minute without id, negative amount refund, unmapped label to "Other" and label recorded, date default in user time zone, revoked token 404, 60/min 429 counted in audit, body over 4 KB rejected, row exists within one minute while rate pending
- [x] T085 [P] [US6] Write failing API tests in `apps/api/test/capture-settings.test.ts`: tokens list without secret, rotate returns new URL once and revokes old, mapping GET/PUT

### Implementation for User Story 6

- [x] T086 [P] [US6] Extend `packages/db/src/schema.ts` with `capture_tokens`, `capture_receipts`, `capture_category_map` and `pnpm db:generate --name capture`
- [x] T087 [P] [US6] Add webhook and capture-settings schemas in `packages/contracts/src/capture.ts` (amount as string or number parsed with the currency exponent)
- [x] T088 [US6] Implement `apps/api/src/services/capture.ts` (token issue/rotate with hashed storage, receipt key derivation, mapping, audit of refusals) and routes `apps/api/src/routes/hooks.ts` (`POST /hooks/generic/:token`, unauthenticated, per-token limiter) and `apps/api/src/routes/capture.ts` (`/capture/tokens`, `/capture/tokens/:label/rotate`, `/capture/mapping`); extend ownership matrix
- [x] T089 [US6] Build `apps/web/src/views/CaptureView.vue` under Settings (address shown once with copy button and iOS Shortcut example, rotate, label mapping table with unmapped badges) and add the time-zone field to `SettingsView.vue` (default from browser at sign-up in `RegisterView.vue`)

**Checkpoint**: Roadmap Phase 3 exit criteria met.

---

## Phase 9: User Story 7 - Use it as an app, even offline (Priority: P3)

**Goal**: Installable PWA, two-tap add, add-only offline queue, states everywhere, WCAG 2.2 AA at 360 px, onboarding. Roadmap Phase 4, branch `phase-4/app-experience`.

**Independent Test**: install on a phone, go offline, add, go online, row exists once; axe clean on every screen.

### Tests for User Story 7

- [ ] T090 [P] [US7] Write failing unit tests in `apps/web/src/offline/queue.test.ts`: enqueue with UUID v7, flush on online, rejected rows kept with reason, queue survives session expiry, local totals include queued rows as estimated
- [ ] T091 [P] [US7] Write failing Playwright tests `tests/e2e/tests/offline.spec.ts` (context offline, add, online, single row) and `tests/e2e/tests/pwa.spec.ts` (manifest with `/add` shortcut, service worker registered, install criteria)
- [ ] T092 [P] [US7] Write failing Playwright test `tests/e2e/tests/onboarding.spec.ts` (first sign-in guide: currency, first expense, optional Notion; skip and resume; dismiss) and add Pixel 7 and iPhone 14 device projects plus axe on every page object to `tests/e2e/playwright.config.ts`

### Implementation for User Story 7

- [ ] T093 [P] [US7] Configure `vite-plugin-pwa` in `apps/web/vite.config.ts` (generateSW, navigation fallback, font runtime cache, manifest with `shortcuts` to `/add`, icons in `apps/web/public/icons/`) and an install prompt composable `apps/web/src/composables/useInstallPrompt.ts` (after second visit)
- [ ] T094 [US7] Implement `apps/web/src/offline/queue.ts` (IndexedDB via `idb`, flush on `online`, app start and Background Sync where available, pending badge count) and wire `ExpenseForm.vue` and `MonthView.vue` to it; add `/add` route opening the form focused
- [ ] T095 [P] [US7] Audit every panel for skeleton, empty and error states with distinct copy per failure kind (offline, session expired, validation, rate unavailable, connector error, server error) in `apps/web/src/components/PanelState.vue` and `apps/web/src/utils/errors.ts`
- [ ] T096 [US7] Build `apps/web/src/views/OnboardingView.vue` (three steps, skip, resume until `onboardingCompletedAt`) and `PATCH /me` support for `onboardingCompletedAt` in `apps/api/src/routes/me.ts`
- [ ] T097 [US7] Responsive pass at 360 px for `MonthView.vue`, `ExpenseForm.vue`, `SettingsView.vue`, `ImportView.vue`, `ConnectorsView.vue`; fix axe findings to zero serious/critical

**Checkpoint**: installed on the owner's phone with two-tap add.

---

## Phase 10: User Story 8 - Understand the year, not just the month (Priority: P3)

**Goal**: Year view, category drill-down, month comparison, forecast with stated basis. Roadmap Phase 4.

**Independent Test**: seeded twelve months; year totals equal month totals; forecast equals spend to date plus remaining fixed budgets plus daily variable run-rate times days left.

### Tests for User Story 8

- [ ] T098 [P] [US8] Write failing core tests in `packages/core/src/forecast.test.ts` (formula, missing inputs named in basis, no fixed budgets, no spend) and `packages/core/src/compare.test.ts`
- [ ] T099 [P] [US8] Write failing API tests in `apps/api/test/insights.test.ts` for `/summary/category/:id`, `/summary/forecast`, `/summary/compare`; extend ownership matrix
- [ ] T100 [P] [US8] Write failing Playwright test `tests/e2e/tests/year.spec.ts` with visual snapshots of year and drill-down charts in light and dark

### Implementation for User Story 8

- [ ] T101 [P] [US8] Implement `packages/core/src/forecast.ts` and `packages/core/src/compare.ts`
- [ ] T102 [US8] Implement the three routes in `apps/api/src/routes/summary.ts`
- [ ] T103 [US8] Build `apps/web/src/views/YearView.vue`, `apps/web/src/views/CategoryView.vue`, `apps/web/src/components/MonthCompare.vue`, `apps/web/src/components/ForecastTile.vue` and `packages/ui/src/charts/YearBars.vue`

**Checkpoint**: insights available on staging.

---

## Phase 11: User Story 9 - Learn what it is and start without help (Priority: P3)

**Goal**: Static landing site with three-step explanation, privacy and terms, sign-up link. Roadmap Phase 4. Blocked on the ADR-0002 name decision for publication only.

**Independent Test**: three outsiders sign up unaided in observed sessions.

### Tests for User Story 9

- [ ] T105 [P] [US9] Write failing Playwright test `tests/e2e/tests/landing.spec.ts` (phone viewport: call to action, three steps and privacy link visible without horizontal scroll; axe) and add `@lhci/cli` config `tests/e2e/lighthouserc.json` asserting performance >= 90, accessibility >= 95 and PWA category on landing and app

### Implementation for User Story 9

- [ ] T106 [P] [US9] Create `apps/landing` workspace (`vite-ssg`, `package.json`, `vite.config.ts`, `src/pages/index.vue`, `src/pages/privacy.vue`, `src/pages/terms.vue`) sharing `packages/ui` tokens; name and screenshots read from `apps/landing/src/content.ts` so the ADR-0002 name is a one-line change
- [ ] T107 [US9] Add a `lighthouse` step to the `e2e-ci` job in `.github/workflows/ci.yml` running `lhci autorun` against the compose stack and the built landing site
- [ ] T108 [US9] Add a `landing` deploy target (static, Fly or Cloudflare Pages) to `.github/workflows/deploy-staging.yml` guarded by a `LANDING_ENABLED` repository variable so it cannot publish under the working name

**Checkpoint**: Roadmap Phase 4 exit criteria met once the name exists.

---

## Phase 12: User Story 10 - Trust the service with real money data (Priority: P3)

**Goal**: Beta operations (feedback, logs, error tracking, uptime, backups, restore, smoke, load) then Stage 2 cut-over with zero data loss. Roadmap Phases 5 and 6, branches `phase-5/beta-ops` and `phase-6/cloudflare`.

**Independent Test**: restore drill matches per-user counts and totals; after cut-over a seeded user's data and connections are intact.

### Tests for User Story 10

- [ ] T109 [P] [US10] Write failing API tests in `apps/api/test/feedback.test.ts` (2,000-char limit, consent-gated metadata, per-user rate limit) and `apps/api/test/healthz.test.ts` extension for `db: ok | degraded`
- [ ] T110 [P] [US10] Write `tests/load/smoke.js` (k6: 50 virtual users, month view p95 under 500 ms server, thresholds fail the run)
- [ ] T111 [P] [US10] Write `tests/e2e/tests/smoke.spec.ts` tagged `@local` for post-deploy: `/healthz`, seeded user login, add and delete one expense

### Implementation for User Story 10

- [ ] T112 [P] [US10] Extend `packages/db/src/schema.ts` with `feedback` and `pnpm db:generate --name feedback`; implement `apps/api/src/routes/feedback.ts` and `apps/web/src/components/FeedbackWidget.vue` (disabled offline, rate-limit message); daily digest job `apps/api/src/jobs/feedback-digest.ts`
- [ ] T113 [P] [US10] Add Sentry behind the `Logger` interface (`@sentry/node` in `apps/api/src/adapters/logger-node.ts`, `@sentry/cloudflare` in `apps/api/src/adapters/logger-worker.ts`) with `SENTRY_DSN` optional in `.env.example`
- [ ] T114 [P] [US10] Add nightly backup job `infra/fly/backup.sh` (pg_dump to Cloudflare R2, 30-day retention) scheduled via the Fly machine, and `docs/runbooks/restore.md` with the four-hour drill procedure and per-user verification query in `packages/db/src/verify-totals.sql`
- [ ] T115 [US10] Add `.github/workflows/deploy-fly.yml` (tag `v0.*`: build, deploy staging, run `smoke.spec.ts`, promote to `desk-production` app, `fly releases rollback` on failure) and an external uptime check note (one-minute interval, alert after three failures) in `docs/runbooks/uptime.md`
- [ ] T116 [US10] Tag `v0.1.0` per roadmap Phase 5
- [ ] T117 [US10] Implement Stage 2 bindings in `apps/api/src/worker.ts` (Hyperdrive connection string, `KvSessionStore` in `apps/api/src/adapters/session-store-kv.ts`, cron `scheduled` handler calling `runDueJobs`) and `infra/cloudflare/wrangler.toml` (Hyperdrive, KV, cron triggers, Pages assets)
- [ ] T118 [US10] Add `.github/workflows/deploy-cf.yml` (tag `v1.*`: `wrangler deploy`, Pages upload of `apps/web/dist`, full e2e-ci against the Cloudflare preview, smoke on the custom domain)
- [ ] T119 [US10] Write `docs/runbooks/cutover.md` (read-only window on Fly, optional pg_dump to Neon, DNS flip, per-user totals before and after, one-hour rollback path, 30-day read-only fallback, Fly scale-to-zero) and execute it to tag `v1.0.0`

**Checkpoint**: SC-007 and SC-008 met.

---

## Phase 13: Polish & Cross-Cutting Concerns

- [ ] T120 [P] Keep `CHANGELOG.md` current with one line per PR across all phases and update `CLAUDE.md` "Current state" at each phase exit
- [ ] T121 [P] Generate OpenAPI from `packages/contracts` (`packages/contracts/scripts/openapi.ts`) and publish `packages/contracts/openapi.json`; add a CI check that it is up to date
- [x] T122 [P] Add `pnpm audit --audit-level high` to the `lint` job in `.github/workflows/ci.yml` (done 2026-09-18)
- [ ] T123 Run the full quickstart.md validation per phase before each phase PR is merged and record results in the PR description; record the people-based checks (SC-006 three observed sign-ups, SC-009 15-second phone add) with dates and pass/fail in the Phase 4 PR, marked `needs-rostom` in `docs/ROADMAP.md` until run
- [ ] T124 [P] Accept ADR-0001 and ADR-0002 (owner) and rename "Desk" across `apps/`, `infra/` and docs once the product name is decided

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 first, T002 to T007 in parallel
- **Foundational (Phase 2)**: depends on Setup; blocks every story. Within it: T008/T009 before T010/T011; T012 to T017 parallel; T018 after T019; T022 after T012 to T016 and T019 to T021; T024 after T022; T025 to T029 parallel after T024
- **US1 (Phase 3)**: depends on Foundational; MVP
- **US2 (Phase 4)**: depends on US1 (users, sessions, currency)
- **US3 (Phase 5)** and **US4 (Phase 6)**: depend on US2 (expenses, categories seed); US3 and US4 can run in parallel
- **US5 (Phase 7)** and **US6 (Phase 8)**: depend on US2; can run in parallel with each other
- **US7 (Phase 9)**, **US8 (Phase 10)**, **US9 (Phase 11)**: depend on US2 to US4; can run in parallel with each other; US9 publication waits for ADR-0002
- **US10 (Phase 12)**: depends on all stories for the beta; T117 to T119 depend on T115/T116 (beta first)
- **Polish (Phase 13)**: T120 and T123 run continuously; T121/T122 any time after Foundational; T124 when the owner decides

### User Story Dependencies

- US1 → US2 → {US3, US4, US5, US6} → {US7, US8, US9} → US10

### Within Each User Story

- Tests are written and fail first (Principle I), then schema/contracts, then core logic, then API services and routes, then web views, then ownership matrix extension, then the checkpoint

### Parallel Opportunities

- Foundational: T008, T009, T012, T013, T014, T015, T016, T017, T020, T021 can all run at once
- US1: T030 to T035 in parallel; T037 and T038 in parallel; T044 in parallel with T042/T043
- US2: T047 to T050 in parallel; T052, T053, T054, T057 in parallel
- US5 and US6 are independent branches of work after US2
- US7, US8, US9 are independent after US4

---

## Parallel Example: User Story 1

```text
# Write all failing tests together:
T030 apps/api/test/auth.test.ts
T031 apps/api/test/password-reset.test.ts
T032 apps/api/test/google.test.ts
T033 apps/api/test/me.test.ts
T034 packages/connectors/rates/frankfurter.test.ts
T035 tests/e2e/tests/auth.spec.ts

# Then build in parallel:
T037 packages/contracts/src/auth.ts, me.ts, jobs.ts
T038 packages/connectors/rates/frankfurter.ts, fake.ts + apps/api/src/services/rates.ts
T044 apps/web/src/views/{Register,Login,Verify,Forgot,Reset}View.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Setup and Foundational (T001 to T029)
2. Complete US1 (T030 to T046)
3. **STOP and VALIDATE**: quickstart.md Phase 1 steps; a stranger registers on staging into an empty, isolated account
4. Merge `phase-1/accounts`; deploy to staging

### Incremental Delivery

1. US2 → Phase 2 core loop usable by the owner for a week (SC-003)
2. US3 + US4 → Phase 2 complete
3. US5 + US6 → Phase 3, first e2e-local nightly
4. US7 + US8 + US9 → Phase 4, installable app and landing (name pending)
5. US10 → beta tag `v0.1.0`, then cut-over tag `v1.0.0`

### Notes

- [P] tasks touch different files with no dependency on incomplete tasks
- Every phase PR follows the definition of done in the constitution: tests first, CHANGELOG line, coverage not lower, Lighthouse green where a page changed, preview visited
- Commit after each task or logical group; never merge a story with its ownership matrix rows missing
