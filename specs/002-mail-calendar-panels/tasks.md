# Tasks: Mail and Calendar Panels

**Input**: Design documents from `/specs/002-mail-calendar-panels/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/providers.md, quickstart.md
**Generated**: 2026-09-17

**Tests**: included and mandatory. The constitution (Principle I) requires every behaviour change to start with a failing test, so each phase lists its tests before its implementation and `/speckit-implement` must run them red first.

**Baseline dependency**: this is a v2 feature. Every task assumes the baseline foundations from `specs/001-phased-product-baseline/tasks.md` exist: `createApp(deps)` and `apps/api/test/harness.ts`, `apps/api/test/ownership.test.ts`, `SecretBox`, `RateLimiter`, `JobRunner` (`apps/api/src/jobs/runner.ts`), `flags` and `audit_log` tables, `users.time_zone`, `packages/ui` blocks (`PanelFrame` from spec 004), `tests/e2e/fixtures/index.ts`, `infra/mocks` (`@desk/mocks`) and `apps/landing/src/pages/privacy.vue`. Do not start Phase 1 until the Phase 6 cut-over in `docs/ROADMAP.md` is done.

**Organization**: phases follow spec priority (US1 calendar, US2 inbox, US3 manage accounts, US4 standards-based). Foundational carries the connection model and the Today shell because both P1 panels need them (plan.md Slice A). Google mail (plan Slice D) sits inside US2 behind the `panels.google_mail` flag.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (calendar), US2 (inbox), US3 (manage accounts), US4 (standards-based provider)
- Every task names its file(s); paths are repository-relative

## Path Conventions

Monorepo per plan.md: `apps/api/src`, `apps/api/test`, `apps/web/src`, `packages/{core,contracts,connectors,db,ui}/src`, `infra/mocks/src`, `tests/e2e/tests`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, environment, flags and provider mock scaffolding that every slice needs.

- [x] T001 Planning set committed on this branch (2026-09-17); the delivery branch starts from it
- [ ] T002 [P] Add `ical.js` to `packages/connectors` dependencies and confirm `pnpm worker:build` still passes; record the result in the PR description against Principle II
- [ ] T003 [P] Extend `.env.example` with `GOOGLE_PANELS_CLIENT_ID`, `GOOGLE_PANELS_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `GOOGLE_API_BASE`, `GRAPH_API_BASE`, `CALDAV_TEST_URL`, `IMAP_TEST_HOST` with one-line comments, and extend the schema in `apps/api/src/env.ts` (provider id and secret required as a pair; API bases default to the real hosts) with cases in `apps/api/test/env.test.ts`
- [ ] T004 [P] Add the four flag rows `panels.google_calendar`, `panels.google_mail`, `panels.microsoft`, `panels.standards` to the flags seed in `packages/db/src/seed.ts` (seeded `default_on = false`; compose and the e2e-ci job switch them on with `pnpm flags set`) and expose them through the existing `GET /flags` in `apps/api/src/routes/flags.ts`
- [ ] T005 [P] Create the provider mock entry points `infra/mocks/src/google.ts`, `infra/mocks/src/graph.ts`, `infra/mocks/src/caldav.ts`, `infra/mocks/src/imap.ts` as empty Hono sub-apps (IMAP as a TCP listener stub) mounted in `infra/mocks/src/server.ts`, and pass `GOOGLE_API_BASE=http://mocks:4000/google`, `GRAPH_API_BASE=http://mocks:4000/graph`, `CALDAV_TEST_URL`, `IMAP_TEST_HOST=mocks` to the `api` service in `infra/docker-compose.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tables, contracts, pure refresh policy, provider interfaces, connection creation, refresh job skeleton, scheduler and the Today shell with empty states. No provider data flows yet (plan Slice A).

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests (write first, watch them fail)

- [ ] T006 [P] Write failing unit tests in `packages/core/src/panels/refresh-policy.test.ts`: active tier (session seen within 24 h) → next due in five minutes; idle tier → one hour; interval doubles per consecutive failure capped at one hour; twenty failures → `error`; `shouldRefreshOnOpen(lastRefreshAt, now)` true only when older than two minutes
- [ ] T007 [P] Write failing API tests in `apps/api/test/connections.test.ts` (Slice A subset): `GET /connections/providers` reflects flags and lists Google `mail` only when `panels.google_mail` is on; `GET /connections/:provider/start` sets PKCE and state cookie, 302s to the consent URL with the R6 scopes for the requested capabilities, and returns 409 `limit_reached` at ten accounts; callback creates a row with sealed credential, merges capabilities on an existing `(provider, address)`, enqueues `panels.refresh`; `GET /connections` shape from contracts/api.md; `GET /today` returns empty arrays with no accounts
- [ ] T008 [P] Write failing API tests in `apps/api/test/panels-scheduler.test.ts`: `panels.scheduler` enqueues one `panels.refresh` per unpaused account whose `next_refresh_at` is due, skips paused and `error` accounts, and `POST /today/refresh` marks accounts older than two minutes due, returns 202 `{ queued }`, and 429s on the second call within a minute
- [ ] T009 [P] Extend the routes table in `apps/api/test/ownership.test.ts` with all twelve routes in contracts/api.md: the `:id` routes (`PATCH /connections/:id`, `GET /connections/:id/calendars`, `POST /connections/:id/reconnect`, `POST /connections/:id/refresh`, `DELETE /connections/:id`) as user A against user B's ids expecting `not_found`; the list routes (`GET /today`, `GET /connections`, `GET /connections/providers`) asserting user A's response contains none of user B's accounts, events or messages; `POST /today/refresh` asserting only user A's accounts are queued; `GET /connections/:provider/start` and `/callback` asserting a state cookie minted for user B is rejected in user A's session; `POST /connections/standards` asserting the created row is owned by user A
- [ ] T010 [P] Write failing Playwright test `tests/e2e/tests/connections.spec.ts` (ci): `/settings/connections` lists providers per flag; `/today` with no accounts shows both panels' empty states explaining what connecting does and offering the providers; axe on both pages

### Implementation

- [ ] T011 Extend `packages/db/src/schema.ts` with `connected_accounts`, `account_calendars`, `cached_events`, `cached_messages` exactly as data-model.md (columns, `user_id` cascade, uniques, `(user_id, starts_at)` and `(user_id, received_at DESC)` indexes, `citext` addresses) and run `pnpm db:generate --name panels`; add the four tables to the cascade assertion in `apps/api/test/me.test.ts` (`DELETE /me`)
- [ ] T012 [P] Add zod schemas in `packages/contracts/src/today.ts` (`TodayResponse`, `RefreshResponse`) and `packages/contracts/src/connections.ts` (`Account`, `Provider`, `StandardsCreate`, `AccountPatch`, `Calendar`) matching contracts/api.md, plus error codes `limit_reached`, `verification_failed` in `packages/contracts/src/errors.ts`; export from `packages/contracts/src/index.ts`
- [ ] T013 [P] Implement `packages/core/src/panels/refresh-policy.ts` (`tierFor(lastSeenAt, now)`, `nextDueAt(tier, lastRefreshAt, consecutiveFailures)`, `shouldRefreshOnOpen`, `ERROR_AFTER_FAILURES = 20`) and export from `packages/core/src/index.ts`
- [ ] T014 [P] Define the provider interfaces in `packages/connectors/src/panels/index.ts`: `CalendarSource`, `MailSource`, `verify`, `revoke`, `EventOccurrence`, `MessageHeader`, and the error classes `AuthError`, `RateLimited { retryAfterMs }`, `VerificationError { step }`, `ProviderError` from contracts/providers.md; add a `./panels` export to `packages/connectors/package.json`
- [ ] T015 [P] Implement the OAuth helpers `packages/connectors/src/google/oauth.ts` and `packages/connectors/src/microsoft/oauth.ts`: authorize URL builder (PKCE, `access_type=offline`, `prompt=consent` for Google; `common` tenant for Microsoft), code exchange, refresh-token exchange mapping `invalid_grant` to `AuthError`, and Google `revoke`; unit tests in `packages/connectors/src/google/oauth.test.ts` and `packages/connectors/src/microsoft/oauth.test.ts` over a fetch stub
- [ ] T016 Implement `apps/api/src/services/connections.ts`: `listProviders(flags)`, `startOAuth(user, provider, capabilities)` (ten-account check, state cookie payload with capabilities and reconnect flag), `completeOAuth` (create or merge row, seal refresh token with `SecretBox`, set `next_refresh_at = now`, audit `connect`, enqueue `panels.refresh`), `list(user)`; register the provider client registry `apps/api/src/services/provider-registry.ts` mapping provider id to `CalendarSource`/`MailSource` implementations (fakes injected by the test harness)
- [ ] T017 Implement `apps/api/src/routes/connections.ts` for `GET /connections`, `GET /connections/providers`, `GET /connections/:provider/start`, `GET /connections/:provider/callback` (redirect to `/settings/connections?connected=<id>`, fixed target) and mount in `apps/api/src/app.ts`
- [ ] T018 Implement `apps/api/src/jobs/panels-refresh.ts` skeleton: loads the account, opens the credential, dispatches to `refreshCalendar`/`refreshMail` stubs (filled in US1/US2), handles `AuthError` → `reconnect_needed`, `RateLimited` → reschedule at `retryAfterMs`, other errors → `consecutive_failures++`, `last_error`, `next_refresh_at` via refresh-policy, `error` at twenty; success resets failures and sets `last_refresh_at`; register in `apps/api/src/jobs/index.ts`
- [ ] T019 [P] Implement `apps/api/src/jobs/panels-scheduler.ts` (runs every minute from the existing tick; selects due unpaused, non-error accounts and enqueues `panels.refresh` with a per-account dedupe key) and `apps/api/src/services/panels.ts` `markDue(user, olderThanMs, accountId?)` used by both refresh routes with the `RateLimiter` key `panels.refresh:<userId>` at one per minute
- [ ] T020 Implement `apps/api/src/routes/today.ts`: `GET /today` builds the payload in `apps/api/src/services/panels.ts` `todayPayload(user, now)` (days today..today+6 in the user's zone with events all-day first then by start, messages newest first with per-account `unreadCount`, per-account `status`, `lastRefreshAt`, `stale` when older than the tier interval, `reconnectUrl`); `POST /today/refresh` → `markDue`; mount in `apps/api/src/app.ts`
- [ ] T021 [P] Build `apps/web/src/stores/today.ts` (Pinia: `load()` → `GET /today`, `refreshIfStale()` → `POST /today/refresh` when any account is older than two minutes, poll every 60 s while the tab is visible, `filterAccountId`) and `apps/web/src/api/today.ts` typed calls; the month view store must not import it
- [ ] T022 [P] Build `apps/web/src/views/TodayView.vue` with `apps/web/src/components/today/CalendarPanel.vue`, `InboxPanel.vue`, `AccountChip.vue` (label + colour, keyboard-focusable filter toggle) rendering only the loading and empty states via `PanelFrame` from `packages/ui`; add `/today` to `apps/web/src/router.ts` (requiresAuth) and the "Today" entry to the main navigation in `apps/web/src/App.vue`
- [ ] T023 Build `apps/web/src/views/ConnectionsView.vue` (Slice A scope: provider list from `/connections/providers` with flag-hidden providers absent, "connect" buttons opening `/connections/:provider/start`, Google card offering calendar only with the FR-002 explanation when mail is off, account list with provider, address, capabilities, status, last refresh, last error; connect disabled with the limit shown at ten) and add `/settings/connections` to `apps/web/src/router.ts`

**Checkpoint**: Today page and Connections settings exist with empty states; accounts can be connected and are scheduled; no provider data yet. `pnpm test:api`, `pnpm test:unit`, `pnpm worker:build` and `tests/e2e/tests/connections.spec.ts` green.

---

## Phase 3: User Story 1 - See the next seven days across my calendars (Priority: P1) 🎯 MVP

**Goal**: Google and Microsoft calendars feed a seven-day panel with account chips, tentative marks, all-day and multi-day handling in the user's zone, refreshed within five minutes (plan Slice B).

**Independent Test**: connect one Google calendar and one Microsoft calendar in a test account, create an event in each provider dated tomorrow, confirm both appear within five minutes with the right account label; delete one in the provider and confirm it disappears.

### Tests (write first, watch them fail)

- [ ] T024 [P] [US1] Record fixtures under `packages/connectors/src/google/fixtures/calendar/` (calendarList, full window with `singleEvents`, incremental via `syncToken` with one new event, `410` invalid token, `401` revoked, `429`, recurring expansion, all-day multi-day) with redacted ids, and write the failing contract test `packages/connectors/src/google/calendar.test.ts` asserting identical `EventOccurrence[]` from the real client (fetch stub) and `GoogleFake`
- [ ] T025 [P] [US1] Record fixtures under `packages/connectors/src/microsoft/fixtures/calendar/` (calendars list, `calendarView` full and delta, `syncStateNotFound`, `401`, `429` with `Retry-After`, recurring, all-day multi-day) and write the failing contract test `packages/connectors/src/microsoft/calendar.test.ts` for the real client and `GraphFake`
- [ ] T026 [P] [US1] Write failing property tests with fast-check in `packages/core/src/panels/window.test.ts`: an occurrence appears on every display day it covers between today and today+6 in the user's zone and on no other; all-day events keep their calendar date and sort first; declined occurrences are hidden; tentative flag preserved; conversion from UTC and from an explicit zone
- [ ] T027 [P] [US1] Write failing API tests in `apps/api/test/panels-refresh.test.ts` (calendar): a full fetch upserts `cached_events` and deletes rows unseen; a partial (`full: false`) fetch deletes nothing; cursor stored per calendar in `calendar_cursor`; invalid cursor forces a full fetch; `AuthError` sets `reconnect_needed` and keeps rows; rows outside yesterday..today+7 trimmed; only `enabled` calendars fetched
- [ ] T028 [P] [US1] Write failing API tests in `apps/api/test/today.test.ts` (calendar half): events grouped by day in the user's zone, all-day first, two accounts interleaved chronologically, `stale` true when older than the tier interval, `reconnectUrl` present for a `reconnect_needed` account, paused account's events absent
- [ ] T029 [P] [US1] Write failing Playwright test `tests/e2e/tests/today.spec.ts` (ci, calendar): with the fake Google and Graph servers, an event added via the mock appears after `POST /today/refresh` with the right account chip; deleting it removes it; a recurring event shows once per day; a stale account shows the last-refresh time; axe on loading, empty, stale, reconnect and error states at 360 px and desktop
- [ ] T030 [P] [US1] Write the e2e-local spec `tests/e2e/tests/today-calendar.local.spec.ts` tagged `@local`: real Google and Microsoft test accounts, three trials per provider, event created via the provider API appears within five minutes (SC-002), timing written to the report

### Implementation

- [ ] T031 [P] [US1] Implement `packages/connectors/src/google/calendar.ts` (`CalendarSource`: `calendarList.list`, `events.list` with `singleEvents=true`, `timeMin/timeMax`, `syncToken`, `attendees[self].responseStatus` → tentative/declined, `410` → full refetch, `401` → `AuthError`, `429` → `RateLimited`) and `packages/connectors/src/google/fake.ts` (`GoogleFake` replaying fixtures with scripted `addEvent`, `deleteEvent`, `revoke`)
- [ ] T032 [P] [US1] Implement `packages/connectors/src/microsoft/calendar.ts` (`/me/calendars`, `/me/calendarView` per enabled calendar with `Prefer: outlook.timezone="UTC"`, `@odata.deltaLink` cursor, `responseStatus.response` mapping, `syncStateNotFound`/`410` → full, `429` `Retry-After` → `RateLimited`) and `packages/connectors/src/microsoft/fake.ts` (`GraphFake`, scripted mutations)
- [ ] T033 [P] [US1] Implement `packages/core/src/panels/window.ts` (`expandToDays(occurrences, timeZone, today)` returning day buckets today..today+6, all-day first, declined removed) and export from `packages/core/src/index.ts`
- [ ] T034 [US1] Fill `refreshCalendar` in `apps/api/src/jobs/panels-refresh.ts`: list enabled `account_calendars`, call `fetchWindow` with the stored cursor, upsert `cached_events` on `(account_id, provider_event_id)`, delete unseen rows only when `full`, trim outside yesterday..today+7, store `calendar_cursor`; on connect, upsert the calendar list with the primary `enabled`
- [ ] T035 [US1] Use `expandToDays` in `apps/api/src/services/panels.ts` `todayPayload` for the `days` array and add `GET /connections/:id/calendars` (re-list from provider, upsert `account_calendars`) to `apps/api/src/routes/connections.ts`
- [ ] T036 [P] [US1] Implement the Google and Graph mock servers `infra/mocks/src/google.ts` and `infra/mocks/src/graph.ts` on top of `GoogleFake`/`GraphFake` with control routes `POST /__control/:provider/events` (add, delete) and `POST /__control/:provider/revoke` for Playwright, and expose them in `tests/e2e/fixtures/index.ts` as `mockProvider(provider)`
- [ ] T037 [US1] Complete `apps/web/src/components/today/CalendarPanel.vue`: day headings today..today+6, rows with title, time range or "all day", location, tentative mark, `AccountChip`, link opening the provider in a new tab; stale state with last-refresh time, reconnect prompt per account, error copy branching on the error code in `apps/web/src/utils/errors.ts`; wire `refreshIfStale` on mount in `TodayView.vue`

**Checkpoint**: US1 independent test passes against the mocks in e2e-ci and against real Google and Microsoft accounts on the nightly `@local` run.

---

## Phase 4: User Story 2 - See what has arrived across my inboxes (Priority: P1)

**Goal**: read-only inbox panel with unread counts and the newest fifty headers per account across Microsoft, standards-based IMAP and, behind `panels.google_mail`, Google (plan Slices C mail half and D).

**Independent Test**: connect a Microsoft mailbox and a Yahoo mailbox (standards form from US4, or the IMAP mock in ci) in a test account, send each a message, confirm both appear within five minutes newest first; read one in the provider and confirm the unread count drops on the next refresh.

### Tests (write first, watch them fail)

- [ ] T038 [P] [US2] Record fixtures under `packages/connectors/src/microsoft/fixtures/mail/` (inbox delta full page with `$top=50`, incremental with one new message, `syncStateNotFound`, `401`, `429`) and write the failing contract test `packages/connectors/src/microsoft/mail.test.ts` for the real client and `GraphFake` (identical `MessageHeader[]`, preview at most 200 chars)
- [ ] T039 [P] [US2] Write the IMAP session transcript fixture `packages/connectors/src/imap/fixtures/session.txt` (LOGIN, SELECT INBOX, SEARCH UNSEEN, UID SEARCH ALL, UID FETCH with FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] and first 200 bytes of text, LOGOUT; variants: wrong password, changed UIDVALIDITY, empty inbox) and the failing test `packages/connectors/src/imap/client.test.ts` running the client against the scripted fake server through both `Socket` implementations (`socket-node` for real, `socket-worker` under a minimal `connect()` shim)
- [ ] T040 [P] [US2] Record fixtures under `packages/connectors/src/google/fixtures/mail/` (`messages.list` with `labelIds=INBOX` and the category exclusion query, `messages.get?format=metadata`, `historyId` incremental, `404` history too old, `401`) and write the failing contract test `packages/connectors/src/google/gmail.test.ts`
- [ ] T041 [P] [US2] Write failing property tests in `packages/core/src/panels/merge.test.ts`: messages from N accounts interleave strictly newest first, at most fifty per account, per-account unread count equals cached unread rows unless `unreadTotal` is larger, filter by account keeps only that account's rows and count
- [ ] T042 [P] [US2] Extend `apps/api/test/panels-refresh.test.ts` (mail): full fetch replaces cache, incremental appends and trims to the newest fifty, `unread_total` stored when the provider reports one, `mail_cursor` stored, changed cursor validity forces a full fetch, `AuthError` → `reconnect_needed`; and `apps/api/test/today.test.ts` (mail half): newest first across accounts, `unreadCount` uses `unread_total` when above fifty, empty subject returned as `""`
- [ ] T043 [P] [US2] Extend `tests/e2e/tests/today.spec.ts` (ci, inbox): two mock accounts interleave newest first with account chips; filter by account narrows list and count; a message marked read in the mock drops the count after refresh; empty subject renders "(no subject)"; clicking a message opens the provider link in a new tab and the row offers no other action; with `panels.google_mail` off the Google connect card offers calendar only, with it on a Google account shows mail
- [ ] T044 [P] [US2] Write the e2e-local spec `tests/e2e/tests/today-inbox.local.spec.ts` tagged `@local`: real Microsoft mailbox and one Fastmail or iCloud IMAP account (Gmail added once the CASA flag is on), three trials each, message sent via SMTP appears within five minutes (SC-002)

### Implementation

- [ ] T045 [P] [US2] Implement `packages/connectors/src/microsoft/mail.ts` (`MailSource` over `/me/mailFolders/inbox/messages/delta` with `$select=from,subject,bodyPreview,receivedDateTime,isRead,webLink`, `$top=50`, delta cursor, preview truncated to 200 chars) and extend `GraphFake` with `addMessage`, `markRead`
- [ ] T046 [P] [US2] Define the `Socket` interface in `packages/connectors/src/imap/socket.ts` (`connect({host, port, tls})` → `{ read(): Promise<Uint8Array>, write(bytes), close() }`) and implement `apps/api/src/adapters/socket-node.ts` (`node:tls`) and `apps/api/src/adapters/socket-worker.ts` (`cloudflare:sockets`), wiring the right one in `apps/api/src/node.ts` and `apps/api/src/worker.ts`; confirm `pnpm worker:build` passes
- [ ] T047 [US2] Implement the minimal read-only IMAP client `packages/connectors/src/imap/client.ts` (tagged commands, literal parsing for exactly the transcript subset, `MailSource.fetchInbox` returning `unreadTotal` from SEARCH UNSEEN and the newest fifty headers, `UIDVALIDITY:UIDNEXT` cursor, one connection per refresh closed with LOGOUT, `verify` = LOGIN + SELECT INBOX throwing `VerificationError { step: 'login' | 'inbox' }`) and the scripted server `packages/connectors/src/imap/fake-server.ts` with a `ponytail:` comment naming the supported command subset
- [ ] T048 [P] [US2] Implement `packages/connectors/src/google/gmail.ts` (`messages.list` with `labelIds=INBOX&q=-category:promotions -category:social`, `messages.get?format=metadata&metadataHeaders=From,Subject,Date`, `snippet` as preview, `historyId` cursor, history-too-old → full fetch) and extend `GoogleFake` with `addMessage`, `markRead`
- [ ] T049 [P] [US2] Implement `packages/core/src/panels/merge.ts` (`mergeMessages(byAccount, capPerAccount = 50)`, `unreadCountFor(rows, unreadTotal?)`) and export from `packages/core/src/index.ts`
- [ ] T050 [US2] Fill `refreshMail` in `apps/api/src/jobs/panels-refresh.ts`: call `fetchInbox(cred, 50, mail_cursor)`, upsert `cached_messages` on `(account_id, provider_message_id)`, replace all rows on `full`, trim to the newest fifty per account, store `unread_total` and `mail_cursor`; register the Gmail client in `apps/api/src/services/provider-registry.ts` only when `panels.google_mail` is on and add `gmail.readonly` to the Google scope set for `mail` in `apps/api/src/services/connections.ts`
- [ ] T051 [US2] Use `mergeMessages` and `unreadCountFor` in `apps/api/src/services/panels.ts` `todayPayload` for `messages` and `accounts[].unreadCount`
- [ ] T052 [P] [US2] Extend the mocks: `infra/mocks/src/graph.ts` and `infra/mocks/src/google.ts` with message control routes (`add`, `markRead`), and `infra/mocks/src/imap.ts` exposing `fake-server.ts` on port 1143 with a control route `POST /__control/imap/messages`; add `mockProvider('imap')` to `tests/e2e/fixtures/index.ts`
- [ ] T053 [US2] Complete `apps/web/src/components/today/InboxPanel.vue`: unread badge (total and per account), rows with sender, subject or "(no subject)", one-line preview, received time, `AccountChip`, link opening the provider in a new tab and nothing else; account filter driven by `filterAccountId` in `apps/web/src/stores/today.ts`; stale, reconnect and error states with code-specific copy

**Checkpoint**: US2 independent test passes for Microsoft and IMAP in e2e-ci and nightly; Google mail passes in ci with the flag on and stays dark in production until the CASA assessment (research §Owner decisions).

---

## Phase 5: User Story 3 - Manage connected accounts (Priority: P2)

**Goal**: Settings shows every account with status, last refresh and error; rename, recolour, pause, choose calendars, reconnect, disconnect with revoke, and account deletion wipes everything; idle purge after 30 days.

**Independent Test**: connect an account, revoke Desk's access from the provider's side, confirm Settings shows "reconnect needed" within one refresh cycle; disconnect it and confirm no cached messages or events remain and the panels update.

### Tests (write first, watch them fail)

- [ ] T054 [P] [US3] Extend `apps/api/test/connections.test.ts`: `PATCH /connections/:id` updates label and colour, `paused: true` sets `paused_at` and stops scheduling, `paused: false` marks due, `calendars` toggles `enabled` and enqueues a refresh; `POST /connections/:id/reconnect` keeps the row and cache and replaces the credential on callback; `POST /connections/:id/refresh` marks due and rate limits; `DELETE /connections/:id` calls `revoke` first then cascades calendars, events and messages, and still deletes when `revoke` throws while writing `last_error` and an audit row; `DELETE /me` revokes every account before the cascade; audit rows for connect, reconnect, pause, disconnect, revoke failure
- [ ] T055 [P] [US3] Write failing API tests in `apps/api/test/panels-purge.test.ts`: `panels.purge` deletes every cached row of users with no session seen in 30 days and sets `cache_purged_at`; keeps `connected_accounts` and credentials; the next `GET /today` for that user reports `purged: true` per account so the client shows loading, and the next `POST /today/refresh` clears it; a refresh running for an account being deleted is cancelled first via `JobRunner.cancelForUser`
- [ ] T056 [P] [US3] Extend `apps/api/test/panels-refresh.test.ts`: twenty consecutive failures set status `error` and stop scheduling; a successful manual refresh or reconnect returns it to `connected`; a single failure shows no error in the Today payload
- [ ] T057 [P] [US3] Extend `tests/e2e/tests/connections.spec.ts` (ci): account list shows provider, address, capabilities, status, last refresh, last error; rename and recolour reflect in the Today chips; pause hides its items; revoking via the mock control route shows "reconnect needed" in Settings and a per-account reconnect prompt in both panels with data marked stale; disconnect removes its items from both panels; the eleventh connect is disabled with the limit shown and disconnecting one re-enables it; account deletion leaves nothing; axe on the settings page; the connect card's privacy text equals the privacy page's for the same provider (single source, T073)
- [ ] T058 [P] [US3] Extend `tests/e2e/tests/today.spec.ts` (ci): after a simulated 30-day purge (frozen clock advanced, `panels.purge` triggered via the mocks clock route) the panels show loading, not stale rows, until the refresh completes

### Implementation

- [ ] T059 [US3] Extend `apps/api/src/services/connections.ts` with `update(user, id, patch)`, `pause`/`resume`, `setCalendars`, `startReconnect` (state cookie `reconnect: id`), `disconnect` (revoke via the provider client, audit failure, then delete row), `revokeAllForUser` (called from `DELETE /me` in `apps/api/src/routes/me.ts` before the cascade, after `JobRunner.cancelForUser`) and the status transitions per data-model.md
- [ ] T060 [US3] Add `PATCH /connections/:id`, `POST /connections/:id/reconnect` (302 for OAuth providers, 200 `{ needsPassword: true }` for standards), `POST /connections/:id/refresh`, `DELETE /connections/:id` to `apps/api/src/routes/connections.ts`; extend `GET /me/export` in `apps/api/src/routes/me.ts` with `connections` (provider, address, label, capabilities, status; no credentials or cached items)
- [ ] T061 [P] [US3] Implement `apps/api/src/jobs/panels-purge.ts` (daily: delete cached rows for users idle 30 days, set `cache_purged_at`, audit `purge`) and register in `apps/api/src/jobs/index.ts`; add `purged` per account to `todayPayload` in `apps/api/src/services/panels.ts` and to `packages/contracts/src/today.ts`
- [ ] T062 [US3] Complete `apps/web/src/views/ConnectionsView.vue`: per-account card with editable label, colour picker from a fixed palette in `packages/ui/src/tokens.css` (contrast-checked for both themes), pause/resume, calendar checklist from `GET /connections/:id/calendars`, reconnect button (OAuth redirect or password dialog), disconnect with confirm dialog naming what is removed and, for Microsoft and standards accounts, the provider's own revoke instructions from `privacy-text.ts` (FR-003), status badge and last error copy from `apps/web/src/utils/errors.ts`; `?connected=<id>` card on return from the provider listing the capabilities and scopes actually granted (FR-001)
- [ ] T063 [P] [US3] Handle `purged` and `reconnect_needed` in `apps/web/src/stores/today.ts` and the `PanelFrame` usage in both panels: loading state instead of stale rows while purged, per-account reconnect prompt that links to `/settings/connections`

**Checkpoint**: US3 independent test passes; Settings and both panels share one status model; ownership matrix green for every route.

---

## Phase 6: User Story 4 - Add a provider that has no dedicated integration (Priority: P3)

**Goal**: standards-based form (IMAP and CalDAV with an app password) that verifies before saving, names the failing step, and feeds the same panels (plan Slice C standards half).

**Independent Test**: connect an Apple iCloud calendar and a Fastmail mailbox through their standard protocols and confirm the panels behave exactly as with the dedicated providers.

### Tests (write first, watch them fail)

- [ ] T064 [P] [US4] Record fixtures under `packages/connectors/src/caldav/fixtures/` (PROPFIND current-user-principal and calendar-home-set, calendar list, REPORT calendar-query with `expand` honoured, the same without `expand` for local expansion, `sync-token` and `getctag` changes, `401`) and write the failing contract test `packages/connectors/src/caldav/client.test.ts` for the real client (fetch stub) and `CalDavFake`, including a recurring VEVENT expanded locally with `ical.js` and `PARTSTAT` → tentative/declined
- [ ] T065 [P] [US4] Extend `apps/api/test/connections.test.ts` (standards): `POST /connections/standards` with a wrong password answers 422 `verification_failed { step: 'login' }`, an unreachable host names `step: 'connect'`, a bad CalDAV URL names `step: 'discovery'`; success seals `{ password, imapHost, imapPort, caldavUrl }` and never returns it; an existing `(standards, address)` merges capabilities and replaces the credential; presets for `yahoo`, `icloud`, `fastmail` come from `GET /connections/providers`
- [ ] T066 [P] [US4] Write failing Playwright test `tests/e2e/tests/standards.spec.ts` (ci): the standards form with a preset fills host and port; wrong password shows the login-step error; success lands on Settings with the new account; the mocks IMAP and CalDAV endpoints feed both panels with the same fields as the dedicated providers; reconnect with a new password; axe on the form
- [ ] T067 [P] [US4] Extend `tests/e2e/tests/today-inbox.local.spec.ts` and `tests/e2e/tests/today-calendar.local.spec.ts` with cases tagged `@local` for the Fastmail or iCloud account (IMAP inbox and CalDAV calendar), three trials

### Implementation

- [ ] T068 [P] [US4] Implement `packages/connectors/src/caldav/client.ts` (`CalendarSource`: PROPFIND discovery, calendar list, REPORT calendar-query with `expand` over the seven-day window, `ical.js` parsing, local recurrence expansion when the server ignores `expand`, `sync-token`/`getctag` cursor, `verify` = PROPFIND on the calendar home throwing `VerificationError { step: 'discovery' }`) and `packages/connectors/src/caldav/fake.ts`
- [ ] T069 [P] [US4] Add the standards presets table `packages/connectors/src/panels/presets.ts` (`yahoo`, `icloud`, `fastmail`: IMAP host and port, CalDAV URL) and surface it in `listProviders` in `apps/api/src/services/connections.ts`
- [ ] T070 [US4] Implement `createStandards(user, body)` in `apps/api/src/services/connections.ts` (verify IMAP and/or CalDAV per requested capabilities before saving, map `VerificationError.step`, seal the credential, merge on existing address, enqueue refresh) and `POST /connections/standards` in `apps/api/src/routes/connections.ts`; make `reconnect` for standards accept `{ password }` and re-verify
- [ ] T071 [P] [US4] Implement the CalDAV mock `infra/mocks/src/caldav.ts` on top of `CalDavFake` with control routes for add and delete event, and add `mockProvider('caldav')` to `tests/e2e/fixtures/index.ts`
- [ ] T072 [US4] Build `apps/web/src/components/connections/StandardsForm.vue` (preset select, address, app password with "never shown again" note, IMAP host and port, CalDAV URL, capability checkboxes, step-specific error copy) used from `apps/web/src/views/ConnectionsView.vue` for connect and for standards reconnect

**Checkpoint**: US4 independent test passes against the mocks in ci and against a real Fastmail or iCloud account nightly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: privacy text, performance and accessibility gates, verification paperwork, docs.

- [ ] T073 [P] Add the per-provider privacy section (what Desk reads, what it stores, for how long, how to revoke, exact scopes from research R6, and for standards-based IMAP the 200-byte text read used only to build the preview per FR-013) to `apps/landing/src/pages/privacy.vue` from a single source `packages/contracts/src/privacy-text.ts`, and render the same text on the connect card in `apps/web/src/views/ConnectionsView.vue` before consent (FR-016)
- [ ] T074 [P] Add the SC-005 load check `apps/api/test/today-load.test.ts`: seed one user with ten accounts at fifty messages each plus seven days of events and assert `GET /today` under 500 ms server-side; add a Playwright device project run in `tests/e2e/tests/today.spec.ts` asserting render under one second and add `/today` and `/settings/connections` to `tests/e2e/lighthouserc.json` (performance ≥ 90, accessibility ≥ 95)
- [ ] T075 [P] Add `tests/e2e/tests/isolation-panels.spec.ts` (ci): two users each with a mock account; user B never sees user A's chips, events or messages on `/today` or `/settings/connections` (SC-003, browser-level complement to the API ownership matrix); and `/` (month view) makes no request to `/today` (FR-006)
- [ ] T076 [P] Add a `CHANGELOG.md` entry per slice and update `docs/ROADMAP.md` v2 section with the four slices and their production-flag gates; update the "Current state" section of `CLAUDE.md`; record the people-based checks (SC-001 two-minute connect, SC-007 three outsiders across two providers) with dates and results, marked `needs-rostom` in `docs/ROADMAP.md` until run
- [ ] T077 [P] Write `docs/runbooks/panels-provider-verification.md`: Google consent-screen verification for `calendar.readonly` (demo video, privacy URL), Microsoft publisher verification, CASA assessment steps and the flag flips that follow each, plus the test-account inventory for `local-secrets`
- [ ] T078 Run quickstart.md end to end on the compose stack (`pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build && pnpm test:e2e -- --project=ci`) and confirm coverage on `packages/core` and `apps/api` stays at or above 85 % lines

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts after the Phase 6 cut-over; T002–T005 in parallel after T001
- **Foundational (Phase 2)**: depends on Phase 1; blocks every story. T006–T010 (tests) in parallel first; T011 before T016–T020; T012–T015 in parallel with T011; T016 → T017 → T018 → T019/T020; T021–T023 after T012
- **US1 (Phase 3)**: after Phase 2. Tests T024–T030 in parallel; T031–T033 and T036 in parallel; T034 after T031/T032/T018; T035 after T033/T034; T037 after T035
- **US2 (Phase 4)**: after Phase 2; independent of US1 except sharing `TodayView.vue` (T022) and `panels-refresh.ts` (T018). Tests T038–T044 in parallel; T045, T046, T048, T049, T052 in parallel; T047 after T046; T050 after T045/T047/T048; T051 after T049/T050; T053 after T051
- **US3 (Phase 5)**: after Phase 2; exercises data produced by US1 or US2 but its API tests use the fakes directly. T054–T058 in parallel; T059 → T060; T061 and T063 in parallel with T060; T062 after T060
- **US4 (Phase 6)**: after Phase 2 and T046/T047 (IMAP client from US2). T064–T067 in parallel; T068, T069, T071 in parallel; T070 after T068/T069; T072 after T070
- **Polish (Phase 7)**: after every story wanted for the release; T073–T077 in parallel; T078 last

### User Story Dependencies

- **US1 (P1)**: needs only Phase 2 → MVP
- **US2 (P1)**: needs only Phase 2; the Google mail part additionally waits for the CASA assessment before its production flag flips (no code dependency)
- **US3 (P2)**: needs only Phase 2; richer with US1 or US2 data present
- **US4 (P3)**: needs the IMAP client and socket adapters from US2 (T046, T047); the calendar half needs nothing from US1

### Within Each User Story

- Tests are written and fail before implementation; the PR shows the test before the change
- Fixtures and fakes before real clients; real client and fake must pass the same contract test
- Connector → core → job → service → route → store → component
- Every new route enters `apps/api/test/ownership.test.ts` in the same PR

### Parallel Opportunities

- Phase 2 tests T006–T010: five files, no overlap
- US1: T024, T025, T026 (fixtures and property tests) then T031, T032, T033, T036 (four clients/mocks in four folders)
- US2: T038–T041 then T045, T046, T048, T049, T052
- US3: T054–T058 then T061 and T063 alongside T059/T060
- US4: T064–T067 then T068, T069, T071
- Across stories: after Phase 2, US1 and US2 can run on two branches, touching only `TodayView.vue` and `panels-refresh.ts` in common

---

## Parallel Example: User Story 1

```bash
# Tests first, all in parallel (six files):
Task: "Record Google calendar fixtures + contract test in packages/connectors/src/google/calendar.test.ts"
Task: "Record Graph calendar fixtures + contract test in packages/connectors/src/microsoft/calendar.test.ts"
Task: "Property tests in packages/core/src/panels/window.test.ts"
Task: "API tests in apps/api/test/panels-refresh.test.ts (calendar)"
Task: "API tests in apps/api/test/today.test.ts (calendar)"
Task: "Playwright tests/e2e/tests/today.spec.ts (calendar)"

# Then the four independent implementations:
Task: "packages/connectors/src/google/calendar.ts + fake.ts"
Task: "packages/connectors/src/microsoft/calendar.ts + fake.ts"
Task: "packages/core/src/panels/window.ts"
Task: "infra/mocks/src/google.ts + graph.ts"

# Then sequentially: T034 refreshCalendar → T035 todayPayload → T037 CalendarPanel.vue
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + US1)

1. Phase 1 setup, Phase 2 foundational (connections, scheduler, Today shell)
2. US1 calendar for Google and Microsoft
3. **STOP and VALIDATE**: US1 independent test in ci against the mocks, then nightly against real accounts
4. Flip `panels.google_calendar` and `panels.microsoft` in production once the provider verifications in research §Owner decisions pass

### Incremental Delivery

1. Slice A (Phase 2) → empty Today page and Connections settings behind flags
2. Slice B (US1) → calendar panel live (MVP)
3. Slice C (US2 Microsoft + IMAP, US3, US4) → inbox panel, account management, standards form
4. Slice D (US2 Google mail) → code merges behind `panels.google_mail`; production flag after CASA

### Parallel Team Strategy

One developer working evenings (constitution rationale): follow the slice order. If a second pair of hands appears, split after Phase 2: one on US1 (calendar clients, window), one on US2 (Graph mail, IMAP client, socket adapters); US3 and US4 follow.

---

## Notes

- [P] tasks touch different files and depend on nothing incomplete
- Never push, open a PR or merge without Rostom's explicit instruction; commit locally per task
- Every PR: test shown before change, `CHANGELOG.md` line, coverage not lower, Lighthouse green where a page changed, ownership matrix extended, `worker-build` green
- Spec conflicts CHK020–CHK023 were resolved on 2026-09-17 (FR-003, FR-004, FR-006 rewritten); T026/T033, T054/T056/T059 follow the rewritten text
- Google mail (T040, T048, part of T050) may merge at any time; its production flag waits for the CASA assessment recorded in ADR-0004
