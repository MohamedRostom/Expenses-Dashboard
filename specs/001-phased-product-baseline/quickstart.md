# Quickstart: proving each phase

How to run the stack and which test proves each phase's exit criteria. Commands run from the
repository root; Docker is required for the API and e2e suites. See [contracts/api.md](contracts/api.md)
for routes and [data-model.md](data-model.md) for tables.

## Prerequisites

- Node 22, pnpm 12 (`npm i -g pnpm@12`), Docker.
- `cp .env.example .env` and set `DATABASE_URL`; later phases add `SESSION_SECRET`,
  `SECRET_BOX_KEY`, `RESEND_API_KEY` or `SMTP_URL`, `GOOGLE_CLIENT_ID/SECRET`,
  `NOTION_CLIENT_ID/SECRET`, `APP_ORIGIN`. The API refuses to boot if any required one is missing.

```sh
pnpm install
docker compose -f infra/docker-compose.yml up --build --wait   # api :3000, web :5173, postgres, mailpit :8025, mocks
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build
pnpm test:e2e -- --project=ci
```

## Phase 0 (done in PR #1)

- Proof: CI green on a PR that changes the Hello text; preview URL comment; `main` deploys to
  staging. Tests: `packages/core/src/month-key.test.ts`, `apps/api/test/{healthz,env,migrations}.test.ts`,
  `tests/e2e/tests/hello.spec.ts`.

## Phase 1: accounts and currency core

1. Money and currencies: `pnpm --filter @desk/core test` runs fast-check properties in
   `packages/core/src/money/*.test.ts`: parse/format round-trip for every ISO 4217 currency, sum
   invariance under conversion within one minor unit, half-even rounding fixtures.
2. Rates connector: `packages/connectors/rates` contract test replays recorded frankfurter
   responses (weekday, weekend, unknown currency) against both the real client and the fake.
3. Auth API suite with Testcontainers: register → verify (token read from the `email_tokens`
   table through the Mailpit fake) → login on two clients → logout one → reset password → delete.
   `apps/api/test/ownership.test.ts` calls every route as user A with user B's ids and expects
   `not_found` or empty results.
4. Playwright `auth.spec.ts`: sign-up, open Mailpit at `http://localhost:8025`, follow the
   verification link, sign in on two browser contexts, sign out one, delete the account; axe on
   every page.
5. Expected outcome: a stranger can register on staging and land in an empty account in their
   currency; coverage report shows >= 85 % lines on `core` and `api`.

## Phase 2: expenses

1. API suite per route in `apps/api/test/expenses.test.ts`, `categories.test.ts`,
   `imports.test.ts` (bad rows, duplicate rows, mixed currencies, undo) and `currency-change.test.ts`
   (job re-derives every row, progress reported, originals untouched).
2. Playwright `expenses.spec.ts`: on a GBP account add GBP, EUR (weekday) and EGP (Sunday)
   expenses through the form with the mocks container serving seeded rates; assert the month
   total, the original amounts and the Sunday rate date; edit, delete, restore; keyboard
   shortcuts `n`, `[`, `]`.
3. Playwright `import.spec.ts`: import `tests/e2e/fixtures/sample-export.csv` twice; second run
   reports all rows as duplicates.
4. Visual snapshots of the month view charts in light and dark; Lighthouse run via `@lhci/cli`
   asserting performance >= 90 and accessibility >= 95.
5. Expected outcome: the owner uses staging for a week of real expenses in two currencies with no
   manual data fix; SC-010 load check with a seeded 20,000-expense user under one second.

## Phase 3: Notion sync and capture

1. Core sync scenarios in `packages/core/src/sync/*.test.ts`: create both sides, edit both
   sides, delete one side, clock skew, rate-limited responses; each asserts the diff and the
   versions written.
2. Notion connector contract test against recorded 2025-09-03 responses; the fake passes the
   same fixtures.
3. Webhook tests in `apps/api/test/hooks.test.ts`: create, replay with the same `id` (200 with
   the same expense id), revoked token (404), rate limit (429), unmapped category → "Other".
4. e2e-local `notion.spec.ts` on the `desk-local` runner against a real test workspace:
   add in Desk, add in Notion, wait, assert both sides; nightly, opens an issue on failure.
5. Expected outcome: five-minute propagation both ways; three consecutive green nights.

## Phase 4: PWA, insights, landing

1. Playwright device projects (Pixel 7, iPhone 14 viewports) added to the `ci` project matrix.
2. `offline.spec.ts`: go offline, add an expense, go online, assert the row exists once.
3. PWA installability check (manifest, service worker, shortcuts) and Lighthouse PWA category.
4. Component visual snapshots in both themes; landing page Lighthouse all categories >= 90.
5. Expected outcome: installed on the owner's phone with a two-tap add; three outsiders sign up
   unaided.

## Phase 5: beta operations

1. `tests/load/smoke.js` (k6) against staging: 50 virtual users, month view p95 under one
   second.
2. Post-deploy smoke workflow: `/healthz`, login as the seeded user, add and delete one expense.
3. Restore drill per `docs/runbooks/restore.md`: restore last night's dump into a fresh database,
   compare per-user expense counts and totals; must complete within four hours.
4. Expected outcome: 30 days at or above 99.5 % availability, no data loss, one drill done.

## Phase 6: Cloudflare cut-over

1. `pnpm worker:build` with Hyperdrive, KV and cron bindings configured in
   `infra/cloudflare/wrangler.toml`; e2e-ci runs against the Cloudflare preview URL.
2. Migration runbook: read-only window, `pg_dump` to Neon (skipped if Neon from day one), DNS
   flip, smoke on the custom domain, per-user totals before and after must match.
3. Expected outcome: `v1.0.0` live on the custom domain, Fly app scaled to zero, kept 30 days.
