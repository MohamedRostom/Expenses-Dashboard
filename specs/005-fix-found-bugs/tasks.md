# Tasks: Fix Found Bugs — BUG-001 (Notion connection)

**Input**: Design documents from `specs/005-fix-found-bugs/` — [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/notion-api.md](./contracts/notion-api.md), [quickstart.md](./quickstart.md)

**Prerequisites**: specs 001–004 finished (per the Bug Register rule in CLAUDE.md) unless Rostom promotes BUG-001 as urgent. Work on a branch named `phase-N/005-bug-001-notion`.

**Tests**: included and mandatory. Constitution Principle I and FR-001.11 require every behaviour change to start with a failing test, so each story lists its tests first; each test must be run and seen failing before its implementation task starts.

**Living spec**: this file covers BUG-001 only. A later bug appends its own phases with IDs continuing from the last task here — never renumber.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 map to BUG-001's user stories in spec.md

## Path Conventions

pnpm monorepo: `apps/api/src`, `apps/api/test`, `apps/web/src`, `packages/{contracts,db,connectors}/src`, `infra/mocks/src`, `tests/e2e/tests`, `.github/workflows`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: contract values every story uses.

- [ ] T001 [P] Add `'feature_unavailable'` to the `ErrorCode` enum in `packages/contracts/src/errors.ts` (research R1)
- [ ] T002 [P] In `packages/contracts/src/notion.ts`, extend `NotionConnectionStatus` to `['connected', 'error', 'reconnect_needed', 'disconnected']` and add `NotionConnectOutcome = z.enum(['connected', 'no_pages', 'denied', 'expired', 'failed', 'unavailable'])`; export both (and their `T` types) from `packages/contracts/src/index.ts` (data-model §Callback outcome, R9)
- [ ] T003 Regenerate `packages/contracts/openapi.json` with `pnpm --filter @desk/contracts generate:openapi` and commit it (CI `lint` fails when stale)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema and connector surface that US2–US4 build on. US1 can start after Phase 1.

- [ ] T004 Add nullable `refreshTokenEnc: bytea('refresh_token_enc')` to `notionConnections` in `packages/db/src/schema.ts` and generate migration `packages/db/migrations/0009_*.sql` with the project's Drizzle generate script; confirm it contains only `ALTER TABLE "notion_connections" ADD COLUMN "refresh_token_enc" bytea;` (data-model §notion_connections)
- [ ] T005 [P] Record Notion fixtures for the new calls in `packages/connectors/src/notion/fixtures/`: `token-refresh-200.json` (new `access_token` + `refresh_token`), `token-refresh-400-invalid-grant.json`, `revoke-200.json`, `search-empty-200.json` (`results: []`), shaped like the existing recorded fixtures (secrets redacted)
- [ ] T006 Write failing contract tests in `packages/connectors/src/notion/client.test.ts` for `refreshToken(refreshToken)` (POST `/v1/oauth/token`, `grant_type: 'refresh_token'`, Basic auth; returns both tokens; throws `NotionAuthError` on 400/401), `revokeToken(token)` (POST to the revoke endpoint, Basic auth, body `{ token }`; resolves on 200; rejects on error or after a 5 s abort) and `hasSharedContent()` (search `page_size: 1`; `false` for empty results), each against the T005 fixtures; add the same cases for `FakeNotion` so the fake is validated against the same fixtures
- [ ] T007 Implement `refreshToken`, `revokeToken` and `hasSharedContent` in `packages/connectors/src/notion/client.ts` and their scripted equivalents in `packages/connectors/src/notion/fake.ts` (add `failNextWith('refresh_refused' | 'revoke_error')` and a `setSharedContent(boolean)` switch) until T006 passes
- [ ] T008 [P] Add routes to `infra/mocks/src/notion-fake-routes.ts` for token refresh, revoke, an empty-search mode, and an authorize page that can return `error=access_denied`, so e2e-ci can drive every callback outcome

**Checkpoint**: migration applies from scratch in the API test harness; connector contract tests green.

---

## Phase 3: User Story 1 - Honest state when Notion is unavailable (Priority: P1) 🎯 MVP

**Goal**: an unconfigured server answers `/notion/*` with JSON `503 feature_unavailable`, no API request ever gets `index.html`, and Connectors shows a calm unavailable state.

**Independent Test**: with no Notion credentials, sign in, open Connectors: unavailable copy, Connect disabled, no toast; `GET /notion/connection` returns `503` JSON (quickstart §Story 1).

### Tests for User Story 1 ⚠️ write first, see them fail

- [ ] T009 [P] [US1] Write failing API test `apps/api/test/notion-unavailable.test.ts` (FR-001.1 first failing test): build the app with `notion: undefined`; signed in, each JSON route in contracts §"When Notion is not configured" returns `503`, `content-type` JSON, code `feature_unavailable`; unauthenticated gets `401 unauthenticated`; `GET /notion/start` and `/notion/callback` return `302` to `/settings/connectors?notion=unavailable`
- [ ] T010 [P] [US1] Write failing API test `apps/api/test/routes-json.test.ts` (SC-001.5): enumerate the app's registered routes plus one unknown path and call each with `Accept: application/json` (and a signed-in session where required); assert every response has a JSON content type or is an empty-bodied 2xx/3xx; assert an unknown path with `Accept: application/json` returns `404 not_found` JSON; document in the test that SPA page routes are served only to `Accept: text/html` navigations
- [ ] T011 [P] [US1] Write failing unit test in `apps/web/src/api/client.test.ts`: a 200 response with an HTML body makes `apiFetch` reject with `ApiError` code `internal` and message "Unexpected response from the server" (FR-001.3)
- [ ] T012 [P] [US1] Write failing component test `apps/web/src/views/ConnectorsView.test.ts`: `GET /notion/connection` → `503 feature_unavailable` renders "Notion sync isn't available on this server yet.", disables Connect and pushes no toast; `404` renders the not-connected state with Connect enabled; a loading skeleton shows while the request is pending
- [ ] T013 [P] [US1] Add ownership-matrix rows in `apps/api/test/ownership.test.ts` for every `/notion/*` route on the unconfigured stub: users A and B each get `503`, neither response contains the other's data

### Implementation for User Story 1

- [ ] T014 [US1] In `apps/api/src/app.ts`, when `deps.notion` is undefined mount a stub router on `/notion/*` per contracts §"When Notion is not configured" (require auth on JSON routes first, then throw `ApiError('feature_unavailable', 'Notion sync is not available on this server', 503)`; redirect `start`/`callback`), and set `app.notFound` to return the JSON error envelope `404 not_found`; make T009 pass
- [ ] T015 [US1] In `apps/api/src/node.ts`, change the SPA fallback to serve `index.html` only when the method is GET/HEAD and the `Accept` header includes `text/html`; otherwise `return c.notFound()`; make T010 pass
- [ ] T016 [P] [US1] In `apps/web/src/api/client.ts`, wrap the 2xx `JSON.parse` so a parse failure throws `new ApiError('internal', 'Unexpected response from the server', res.status)`; make T011 pass
- [ ] T017 [US1] In `apps/web/src/views/ConnectorsView.vue`, branch the load error on `err.code`: `feature_unavailable` → unavailable state (copy from contracts §Web client, Connect disabled, no toast); `not_found` → not-connected; other codes → existing toast; add the loading skeleton; announce state changes in an `aria-live="polite"` region; make T012 pass
- [ ] T018 [US1] Add `infra/docker-compose.no-notion.yml`, a compose override that sets `NOTION_CLIENT_ID: ""` and `NOTION_CLIENT_SECRET: ""` on the api service (empty values leave `deps.notion` undefined in `node.ts`, and pass `env.ts`'s both-or-neither check); add a Playwright project `ci-no-notion` in `tests/e2e/playwright.config.ts` that greps `@no-notion`; add the `@no-notion` scenario `unavailable` to `tests/e2e/tests/notion.spec.ts` asserting the unavailable copy, Connect disabled, no toast (SC-001.1), and `axeCheck(page)` from `tests/e2e/fixtures` on that state; add a `ci.yml` step that starts the stack with the override and runs `--project=ci-no-notion`

**Checkpoint**: US1 independent test passes; `worker-build` green; live `curl` of `/notion/connection` on a deploy returns JSON.

---

## Phase 4: User Story 2 - Connect a Notion workspace end to end (Priority: P1)

**Goal**: configured environments can connect, see the workspace name, and disconnect; both runtimes wired; deploys set the credentials.

**Independent Test**: mocked connect in e2e-ci shows the workspace name and disconnect returns to not-connected; on staging a real account connects in under a minute (quickstart §Story 2).

### Tests for User Story 2 ⚠️

- [ ] T019 [P] [US2] Extend `apps/api/test/notion.test.ts`: `GET /notion/start` without a session → `302 /login?next=/settings/connectors`; with a session → sets `__Host-desk_notion_oauth` (HTTP-only, Secure, Path=/, Max-Age=600) whose value ends in `.<userId>` and redirects to Notion's authorize URL; a successful callback stores `access_token_enc` **and** `refresh_token_enc` (both sealed, neither equal to the plaintext) and redirects to `?notion=connected`
- [ ] T020 [P] [US2] Extend `tests/e2e/tests/notion.spec.ts` (ci): Connect → mock consent → Connectors shows "Connected to <workspace>"; Disconnect → not-connected state
- [ ] T021 [P] [US2] Add an `@local` test to `tests/e2e/tests/notion.spec.ts` for the real staging round trip with a real Notion account (credentials from the `local-secrets` environment), recording the connect duration for SC-001.2; skip with a clear message when the account secret is absent

### Implementation for User Story 2

- [ ] T022 [US2] In `apps/api/src/routes/notion.ts`, `/notion/start`: redirect unauthenticated visitors to `/login?next=/settings/connectors` instead of throwing; rename the state cookie to `__Host-desk_notion_oauth` with value `<state>.<userId>` (research R5)
- [ ] T023 [US2] In `apps/api/src/services/notion.ts`, make `exchangeCode` return `refresh_token` too and `connect()` seal and store it in `refreshTokenEnc`; when the new `workspace_id` differs from the stored one, clear `databaseId`, `dataSourceId` and `cursor` (data-model validation rules); make T019 pass
- [ ] T024 [P] [US2] In `apps/api/src/worker.ts`, build `notion` from `env.NOTION_CLIENT_ID`, `env.NOTION_CLIENT_SECRET` and optional `env.NOTION_API_BASE` exactly as `apps/api/src/node.ts` does, replacing the hard-coded `undefined` and its comment; add the vars to the Worker env type; run `pnpm worker:build`
- [ ] T025 [P] [US2] In `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-fly.yml` (staging and promote-production jobs), add a step after the Resend step that runs `flyctl secrets set --stage NOTION_CLIENT_ID=... NOTION_CLIENT_SECRET=...` only when both `STAGING_NOTION_CLIENT_ID`/`STAGING_NOTION_CLIENT_SECRET` (resp. `PRODUCTION_…`) are set, and fails with `::error::` if exactly one of the pair is set; update the header comments listing required secrets
- [ ] T026 [US2] Owner step, documented not executed: add to `docs/runbooks/` (new `notion-integration.md`) how Rostom creates the Notion public integration (name "Desk" until ADR-0002 settles it, logo, privacy/terms URLs, redirect URIs `https://ros-desk-staging.fly.dev/notion/callback` and `https://ros-desk-production.fly.dev/notion/callback`) and which four repo secrets to add; label the tracking issue `needs-rostom`

**Checkpoint**: mocked connect/disconnect green in e2e-ci; after the owner step, a staging deploy shows Connect enabled and the `@local` round trip passes.

---

## Phase 5: User Story 3 - Clear outcomes when connecting doesn't finish (Priority: P2)

**Goal**: every callback ends on Connectors with an outcome-specific message; nothing is stored on failure; empty shares are explained.

**Independent Test**: with the mocked Notion, trigger cancel, expired and failed; each lands on Connectors with its own message and a working Try again (quickstart §Story 3).

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] Extend `apps/api/test/notion.test.ts` with one case per row of contracts §`GET /notion/callback`: `error=access_denied` → `denied`; other `error` → `failed`; no cookie, wrong state, cookie for another user, signed out, and a replayed link → `expired`; exchange 4xx and Notion unreachable → `failed`; `FakeNotion.setSharedContent(false)` → `no_pages` with the connection stored; success → `connected`. Each asserts the redirect target, that the cookie is cleared, and whether a row exists; none returns a JSON body
- [ ] T028 [P] [US3] Extend `apps/web/src/views/ConnectorsView.test.ts`: each `?notion=<outcome>` renders the copy in contracts §Web client (`denied` without error styling; `no_pages` with "Reconnect to choose pages"; `expired`/`failed` with Try again), and the query parameter is removed after reading
- [ ] T029 [P] [US3] Add e2e-ci scenarios to `tests/e2e/tests/notion.spec.ts` for `denied`, `expired` and `no_pages` via the T008 mock modes (SC-001.3), each ending with `axeCheck(page)` on the outcome message

### Implementation for User Story 3

- [ ] T030 [US3] Rewrite the `/notion/callback` handler in `apps/api/src/routes/notion.ts` to the first-match outcome table in contracts: always delete the cookie, never throw to the browser, redirect to `/settings/connectors?notion=<outcome>`; call `hasSharedContent()` after a successful exchange; make T027 pass
- [ ] T031 [US3] In `apps/web/src/views/ConnectorsView.vue`, read `route.query.notion` (validated with `NotionConnectOutcome`), show the outcome message in the live region, then `router.replace` without the parameter; wire Try again / Reconnect to `/notion/start`; make T028 pass

**Checkpoint**: 5 of 5 outcomes land on Connectors with specific copy; no raw JSON reachable from the browser.

---

## Phase 6: User Story 4 - Notice when access is taken away (Priority: P3)

**Goal**: silent renewal; `reconnect_needed` when renewal fails, sync stops, the user sees it in-app; disconnect and account deletion revoke at Notion.

**Independent Test**: with `FakeNotion`, a 401 followed by a refused renewal marks the connection `reconnect_needed` and a second sync makes no Notion call (quickstart §Story 4).

### Tests for User Story 4 ⚠️

- [ ] T032 [P] [US4] Extend `apps/api/test/notion.test.ts` (sync): 401 then successful refresh → sync succeeds, both stored tokens replaced, status `connected`; 401 then `refresh_refused` → status `reconnect_needed`, a second `syncNow` makes zero Notion calls and `triggerSyncSoon` schedules nothing; legacy row with `refresh_token_enc` NULL + 401 → `reconnect_needed`; transient 429/5xx → status `error` and the next sync retries; reconnect from `reconnect_needed` → `connected`; and for SC-001.4's 10-minute bound, with a frozen clock assert that the `notion.sync` job reschedules itself no more than 5 minutes out and that the first run after Notion starts returning 401 (with renewal refused) sets `reconnect_needed` in that same run
- [ ] T033 [P] [US4] Extend `apps/api/test/notion.test.ts` (disconnect/delete): `DELETE /notion/connection` calls `revokeToken` and clears both token columns even when revoke rejects or times out; `DELETE /me` calls `revokeToken` before the cascading wipe and still deletes the account when revoke fails
- [ ] T034 [P] [US4] Write a failing logging test in `apps/api/test/notion-logging.test.ts`: pass a capturing fake `Logger` (the interface in `apps/api/src/adapters/logger.ts`) as `deps.logger` to `createApp`, drive a failed exchange, failed renewal, refused access and failed revoke; assert one structured entry each with `event`, `outcome`, `userId`, `notionError`, and that no entry contains any substring (≥ 6 chars) of the fake access or refresh tokens, the OAuth code or the state (FR-001.12)
- [ ] T035 [P] [US4] Extend `apps/web/src/views/ConnectorsView.test.ts` and add `apps/web/src/views/MonthView.test.ts` cases: status `reconnect_needed` renders the Reconnect Notion state; the month view shows a small reconnect indicator linking to `/settings/connectors` and hides it for 404/503 responses

### Implementation for User Story 4

- [ ] T036 [US4] In `apps/api/src/services/notion.ts`, add a `withFreshToken(userId, fn)` path used by `syncNow` and user-initiated Notion calls: on `NotionAuthError`, if `refreshTokenEnc` exists call `refreshToken`, store both new tokens with an update conditional on the old `refreshTokenEnc`, retry `fn` once; otherwise or on failure set `status = 'reconnect_needed'`; keep `status = 'error'` for non-auth failures; make `syncNow` and `triggerSyncSoon` skip `reconnect_needed`; stop `apps/api/src/jobs/notion-sync.ts` rescheduling for `reconnect_needed`/`disconnected`; make T032 pass
- [ ] T037 [US4] In `apps/api/src/services/notion.ts` `disconnect()`, call `revokeToken` (5 s timeout, errors caught and logged) before clearing `accessTokenEnc` and `refreshTokenEnc`; call the same revoke helper from the `DELETE /me` handler in `apps/api/src/routes/me.ts` before the cascading wipe; make T033 pass
- [ ] T038 [US4] Add structured logging per research R10 at each failure point in `apps/api/src/services/notion.ts` and `apps/api/src/routes/notion.ts` (event, outcome, userId, Notion's error code only), through the existing `Logger` from `apps/api/src/adapters/logger.ts` (pass `deps.logger` into the Notion service deps; no new logging path — Sentry forwarding in `logger-node.ts`/`logger-worker.ts` then applies automatically); make T034 pass
- [ ] T039 [US4] Implement the Reconnect Notion state in `apps/web/src/views/ConnectorsView.vue` and the indicator in `apps/web/src/views/MonthView.vue` (fetches `/notion/connection` once, ignores 404/503, keyboard-reachable link with an accessible name); make T035 pass

**Checkpoint**: SC-001.4 asserted in the API suite; Story 4 independent test passes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Run `pnpm worker:build` and the full API, web and e2e-ci suites; confirm coverage on `apps/api` is not lower than on `main`; confirm the Lighthouse budgets (perf ≥ 90, a11y ≥ 95) still pass for `/settings/connectors` and `/` in the ci run (constitution definition of done)
- [ ] T041 [P] Add a CHANGELOG line under `[Unreleased] → Fixed` for BUG-001 in `CHANGELOG.md`
- [ ] T042 Walk every table in `specs/005-fix-found-bugs/quickstart.md` and record results in the PR description
- [ ] T043 After the tag carrying this fix passes the staging smoke, set BUG-001's Bug Register row in `specs/005-fix-found-bugs/spec.md` to `Fixed in vX.Y.Z` and record SC-001.2 from the first real staging connect

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Phase 1; blocks US2–US4.
- **US1 (Phase 3)**: after Phase 1 only — can run alongside Phase 2.
- **US2 (Phase 4)**: after Phase 2. T025/T026 unblock the real staging test (T021); everything else runs against mocks.
- **US3 (Phase 5)**: after Phase 2 and T022 (cookie format).
- **US4 (Phase 6)**: after Phase 2 and T023 (refresh token stored on connect).
- **Polish (Phase 7)**: after the stories being shipped.

### User Story Dependencies

- US1 is independent and is the MVP: it ends the visible bug on every environment.
- US2 depends on Foundational; its live acceptance also depends on the owner step (T026).
- US3 and US4 depend on US2's connect path but not on each other.

### Within Each User Story

- Tests first, run and seen failing; then implementation in the order listed; checkpoint before moving on.

### Parallel Opportunities

- T001 ∥ T002; T005 ∥ T008.
- US1 tests T009–T013 in parallel; T016 alongside T014/T015.
- US2: T024 ∥ T025 alongside T022/T023.
- US3 tests T027–T029 in parallel; US4 tests T032–T035 in parallel.
- After Phase 2, US3 and US4 can proceed in parallel on different files except `apps/api/src/services/notion.ts` and `ConnectorsView.vue` (sequence those tasks).

## Parallel Example: User Story 1

```text
# Tests together:
T009 apps/api/test/notion-unavailable.test.ts
T010 apps/api/test/routes-json.test.ts
T011 apps/web/src/api/client.test.ts
T012 apps/web/src/views/ConnectorsView.test.ts
T013 apps/api/test/ownership.test.ts

# Then implementation, T016 in parallel with T014 → T015:
T014 apps/api/src/app.ts
T016 apps/web/src/api/client.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

Phase 1 → Phase 3. Ship it: the "Failed to load Notion connection" toast disappears on every environment, and the HTML-instead-of-data bug class is closed for all routes. No owner action needed.

### Incremental Delivery

1. US1 → deploy (MVP).
2. Phase 2 + US2 → deploy; Rostom completes T026's owner step; Notion works on staging and production.
3. US3 → deploy (every failed connect is explained).
4. US4 → deploy (renewal, reconnect, revoke).

### Parallel Team Strategy

One agent on US1 while another does Phase 2; then US3 and US4 in parallel, coordinating on `services/notion.ts` and `ConnectorsView.vue`.

## Notes

- Tests before implementation in every story, per Principle I.
- Commit after each task or logical group; never push, open a PR or merge without Rostom's explicit instruction.
- Checklist `checklists/notion-oauth.md` items still open (CHK004, CHK005, CHK007, CHK008, CHK018, CHK019, CHK022, CHK029, CHK030, CHK034) should be reviewed before starting; T017/T039 already cover CHK029's live region and keyboard access.
