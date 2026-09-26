# Tasks: Mail and Calendar Panels

**Input**: Design documents from `/specs/002-mail-calendar-panels/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/providers.md, quickstart.md
**Generated**: 2026-09-17

**Tests**: included and mandatory. The constitution (Principle I) requires every behaviour change to start with a failing test, so each phase lists its tests before its implementation and `/speckit-implement` must run them red first.

**Baseline dependency**: this is a v2 feature. Every task assumes the baseline foundations from `specs/001-phased-product-baseline/tasks.md` exist: `createApp(deps)` and `apps/api/test/harness.ts`, `apps/api/test/ownership.test.ts`, `SecretBox`, `RateLimiter`, `JobRunner` (`apps/api/src/jobs/runner.ts`), `flags` and `audit_log` tables, `users.time_zone`, `packages/ui` blocks (`PanelFrame` from spec 004; if 004 has not landed when Phase 2 starts, use the baseline `apps/web/src/components/PanelState.vue` and switch when 004's T011 folds it into `PanelFrame`), `tests/e2e/fixtures/index.ts`, `infra/mocks` (`@desk/mocks`) and `apps/landing/src/pages/privacy.vue`. The Phase 6 cut-over no longer gates this feature: on 2026-09-26 Rostom moved it to the final stage of `specs/005-fix-found-bugs` (T044), so every phase is built and deployed on Stage 1 with its `panels.*` flag off until released, and the scheduler stays behind the `JobRunner` interface so it runs unchanged on either stage.

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
- [X] T002 [P] Add `ical.js` to `packages/connectors` dependencies and confirm `pnpm worker:build` still passes; record the result in the PR description against Principle II
- [X] T003 [P] Extend `.env.example` with `GOOGLE_PANELS_CLIENT_ID`, `GOOGLE_PANELS_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `GOOGLE_API_BASE`, `GRAPH_API_BASE`, `CALDAV_TEST_URL`, `IMAP_TEST_HOST` with one-line comments, and extend the schema in `apps/api/src/env.ts` (provider id and secret required as a pair; API bases default to the real hosts) with cases in `apps/api/test/env.test.ts`
- [X] T004 [P] Add the five flag rows `panels.today` (gates the Today page, the Connections settings section and their API routes; constitution VI), `panels.google_calendar`, `panels.google_mail`, `panels.microsoft`, `panels.standards` to the flags seed in `packages/db/src/seed.ts` (seeded `default_on = false`; compose and the e2e-ci job switch them on with `pnpm flags set`) and expose them through the existing `GET /flags` in `apps/api/src/routes/misc.ts` (proved by T007)
- [X] T005 [P] Create the provider mock entry points `infra/mocks/src/google.ts`, `infra/mocks/src/graph.ts`, `infra/mocks/src/caldav.ts`, `infra/mocks/src/imap.ts` as empty Hono sub-apps (IMAP as a TCP listener stub) mounted in `infra/mocks/src/server.ts`, and pass `GOOGLE_API_BASE=http://mocks:4000/google`, `GRAPH_API_BASE=http://mocks:4000/graph`, `CALDAV_TEST_URL`, `IMAP_TEST_HOST=mocks` to the `api` service in `infra/docker-compose.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tables, contracts, pure refresh policy, provider interfaces, connection creation, refresh job skeleton, scheduler and the Today shell with empty states. No provider data flows yet (plan Slice A).

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests (write first, watch them fail)

- [X] T006 [P] Write failing unit tests in `packages/core/src/panels/refresh-policy.test.ts`: active tier (`users.last_active_at` within 24 h) → next due in five minutes; idle tier → one hour; interval doubles per consecutive failure capped at one hour; twenty failures → `error`; `shouldRefreshOnOpen(lastRefreshAt, now)` true only when older than two minutes
- [X] T007 [P] Write failing API tests in `apps/api/test/connections.test.ts` (Slice A subset): `GET /connections/providers` reflects flags and lists Google `mail` only when `panels.google_mail` is on; `GET /connections/:provider/start` sets PKCE and state cookie, 302s to the consent URL with the R6 scopes for the requested capabilities, and returns 409 `limit_reached` at ten accounts unless `account=<id>` names one of the user's accounts; callback derives capabilities from the granted scopes (a partial Google grant keeps only what was granted; none granted redirects with `error=scope_denied` and creates no row), a new address at ten accounts redirects with `error=limit_reached`, an `account` state whose address differs redirects with `error=account_mismatch`; callback creates a row with sealed credential, merges capabilities on an existing `(provider, address)`, enqueues `panels.refresh`; `GET /connections` shape from contracts/api.md; `GET /panels/today` returns empty arrays with no accounts; with `panels.today` off `GET /panels/today` and every `/connections*` route answer 404; `GET /flags` returns the five `panels.*` flags (T004)
- [X] T008 [P] Write failing API tests in `apps/api/test/panels-scheduler.test.ts`: `panels.scheduler` enqueues one `panels.refresh` per unpaused account whose `next_refresh_at` is due, skips paused and `error` accounts, and `POST /panels/today/refresh` marks accounts older than two minutes due, returns 202 `{ queued }`, and 429s on the second call within a minute; `POST /connections/:id/refresh` on an `error` account enqueues `panels.refresh` directly while the scheduler still skips it (FR-004); an authenticated request updates `users.last_active_at` at most once per five minutes under both the Postgres and the KV `SessionStore` (Stage 2 has no SQL session row)
- [X] T009 [P] Extend the routes table in `apps/api/test/ownership.test.ts` with all twelve routes in contracts/api.md: the `:id` routes (`PATCH /connections/:id`, `GET /connections/:id/calendars`, `POST /connections/:id/reconnect`, `POST /connections/:id/refresh`, `DELETE /connections/:id`) as user A against user B's ids expecting `not_found`; the list routes (`GET /panels/today`, `GET /connections`, `GET /connections/providers`) asserting user A's response contains none of user B's accounts, events or messages; `POST /panels/today/refresh` asserting only user A's accounts are queued; `GET /connections/:provider/start` and `/callback` asserting a state cookie minted for user B is rejected in user A's session; `POST /connections/standards` asserting the created row is owned by user A
- [X] T010 [P] Write failing Playwright test `tests/e2e/tests/connections.spec.ts` (ci): `/settings/connections` lists providers per flag; `/today` with no accounts shows both panels' empty states explaining what connecting does and offering the providers; with `panels.today` off the navigation has no Today entry and `/today` and `/settings/connections` redirect to `/`; axe on both pages

### Implementation

- [X] T011 Extend `packages/db/src/schema.ts` with `connected_accounts`, `account_calendars`, `cached_events`, `cached_messages` exactly as data-model.md (columns including `account_calendars.cursor`, `user_id` cascade, uniques including `cached_events (calendar_id, provider_event_id)`, `(user_id, starts_at)` and `(user_id, received_at DESC)` indexes, lowercased `text` addresses) plus `users.last_active_at timestamptz NULL`, and run `pnpm db:generate --name panels`; write `last_active_at` from `apps/api/src/middleware/session.ts` at most once per five minutes per user (proved by T008); add the four tables to the cascade assertion in `apps/api/test/me.test.ts` (`DELETE /me`)
- [X] T012 [P] Add zod schemas in `packages/contracts/src/today.ts` (`TodayResponse`, `RefreshResponse`) and `packages/contracts/src/connections.ts` (`Account`, `Provider`, `StandardsCreate`, `AccountPatch`, `Calendar`) matching contracts/api.md, plus error codes `limit_reached`, `verification_failed`, `host_not_allowed`, `scope_denied`, `account_mismatch` and the account error codes `provider_unreachable`, `access_revoked`, `rate_limited`, `login_failed` (stored in `last_error`, FR-014) in `packages/contracts/src/errors.ts`; export from `packages/contracts/src/index.ts`
- [X] T013 [P] Implement `packages/core/src/panels/refresh-policy.ts` (`tierFor(lastActiveAt, now)` over `users.last_active_at`, `nextDueAt(tier, lastRefreshAt, consecutiveFailures)`, `shouldRefreshOnOpen`, `ERROR_AFTER_FAILURES = 20`) and export from `packages/core/src/index.ts`
- [X] T014 [P] Define the provider interfaces in `packages/connectors/src/panels/index.ts`: `CalendarSource`, `MailSource`, `verify`, `revoke`, `EventOccurrence`, `MessageHeader`, and the error classes `AuthError`, `RateLimited { retryAfterMs }`, `VerificationError { step }`, `ProviderError` from contracts/providers.md; add a `./panels` export to `packages/connectors/package.json`
- [X] T015 [P] Test first: write failing unit tests in `packages/connectors/src/google/oauth.test.ts` and `packages/connectors/src/microsoft/oauth.test.ts` over a fetch stub and watch them fail, then implement the OAuth helpers `packages/connectors/src/google/oauth.ts` and `packages/connectors/src/microsoft/oauth.ts`: authorize URL builder (PKCE, `access_type=offline`, `prompt=consent` for Google; `common` tenant for Microsoft), code exchange returning the granted scopes, refresh-token exchange mapping `invalid_grant` to `AuthError` and returning any rotated refresh token (Microsoft rotates on every exchange), and Google `revoke`
- [X] T016 Implement `apps/api/src/services/connections.ts`: `listProviders(flags)`, `startOAuth(user, provider, capabilities, accountId?)` (ten-account check skipped when `accountId` names an owned account, state cookie payload with capabilities, target account and reconnect flag), `completeOAuth` (capabilities from granted scopes, limit and address-match checks per contracts/api.md, create or merge row, seal refresh token with `SecretBox`, set `next_refresh_at = now`, audit `connect`, enqueue `panels.refresh`), `list(user)`; register the provider client registry `apps/api/src/services/provider-registry.ts` mapping provider id to `CalendarSource`/`MailSource` implementations (fakes injected by the test harness)
- [X] T017 Implement `apps/api/src/routes/connections.ts` for `GET /connections`, `GET /connections/providers`, `GET /connections/:provider/start`, `GET /connections/:provider/callback` (redirect to `/settings/connections?connected=<id>`, fixed target) and mount in `apps/api/src/app.ts` behind `panels.today` (404 when off)
- [X] T018 Implement `apps/api/src/jobs/panels-refresh.ts` skeleton: loads the account, opens the credential, dispatches to `refreshCalendar`/`refreshMail` stubs (filled in US1/US2), re-seals and stores any `rotatedCredential` before writing the cache, handles `AuthError` → `reconnect_needed` with `last_error = access_revoked`, `RateLimited` → reschedule at `retryAfterMs` with `rate_limited`, other errors → `consecutive_failures++`, `last_error` as a code (`provider_unreachable`, `login_failed`; never provider text), `next_refresh_at` via refresh-policy, `error` at twenty; success resets failures and sets `last_refresh_at`; register in `apps/api/src/jobs/index.ts`
- [X] T019 [P] Implement `apps/api/src/jobs/panels-scheduler.ts` (runs every minute from the existing tick; selects due unpaused, non-error accounts and enqueues `panels.refresh` with a per-account dedupe key) and `apps/api/src/services/panels.ts` `markDue(user, olderThanMs)` used by `POST /panels/today/refresh`, and `refreshNow(user, accountId)` used by `POST /connections/:id/refresh`, which enqueues `panels.refresh` directly so an `error` account can recover (FR-004); both share the `RateLimiter` key `panels.refresh:<userId>` at one per minute
- [X] T020 Implement `apps/api/src/routes/today.ts`: `GET /panels/today` builds the payload in `apps/api/src/services/panels.ts` `todayPayload(user, now)` (days today..today+6 in the user's zone with events selected by overlap with the window, not by start, all-day first then by start, messages newest first with per-account `unreadCount`, per-account `status`, `lastRefreshAt`, `stale` when older than the tier interval, `reconnectUrl`); `POST /panels/today/refresh` → `markDue`; mount in `apps/api/src/app.ts` behind `panels.today`
- [X] T021 [P] Build `apps/web/src/stores/today.ts` (Pinia: `load()` → `GET /panels/today`, `refreshIfStale()` → `POST /panels/today/refresh` when any account is older than two minutes, after `refreshIfStale` fires poll every 10 s for 30 s, then every 60 s while the tab is visible (research R4, SC-002 ten-second bound), `filterAccountId`) and `apps/web/src/api/today.ts` typed calls; the month view store must not import it
- [X] T022 [P] Build `apps/web/src/views/TodayView.vue` with `apps/web/src/components/today/CalendarPanel.vue`, `InboxPanel.vue`, `AccountChip.vue` (label + colour, filter toggle as a button with `aria-pressed` in the tab order, FR-024; a polite live region announcing panel state changes) rendering only the loading and empty states via `PanelFrame` from `packages/ui`; add `/today` to `apps/web/src/router.ts` (requiresAuth, redirect to `/` when `panels.today` is off) and the "Today" entry to the main navigation in `apps/web/src/App.vue`, shown only when `panels.today` is on
- [X] T023 Build `apps/web/src/views/ConnectionsView.vue` (Slice A scope: provider list from `/connections/providers` with flag-hidden providers absent, "connect" buttons opening `/connections/:provider/start`, Google card offering calendar only with the FR-002 explanation when mail is off, account list with provider, address, capabilities, status, last refresh, last error; connect disabled with the limit shown at ten) and add `/settings/connections` to `apps/web/src/router.ts` (redirect to `/` when `panels.today` is off)

**Checkpoint**: Today page and Connections settings exist with empty states; accounts can be connected and are scheduled; no provider data yet. `pnpm test:api`, `pnpm test:unit`, `pnpm worker:build` and `tests/e2e/tests/connections.spec.ts` green.

---

## Phase 3: User Story 1 - See the next seven days across my calendars (Priority: P1) 🎯 MVP

**Goal**: Google and Microsoft calendars feed a seven-day panel with account chips, tentative marks, all-day and multi-day handling in the user's zone, refreshed within five minutes (plan Slice B).

**Independent Test**: connect one Google calendar and one Microsoft calendar in a test account, create an event in each provider dated tomorrow, confirm both appear within five minutes with the right account label; delete one in the provider and confirm it disappears.

### Tests (write first, watch them fail)

- [x] T024 [P] [US1] Record fixtures under `packages/connectors/src/google/fixtures/calendar/` (calendarList, full window with `singleEvents`, incremental via `syncToken` with one new event, `410` invalid token, `401` revoked, `429`, recurring expansion, all-day multi-day) with redacted ids, and write the failing contract test `packages/connectors/src/google/calendar.test.ts` asserting identical `EventOccurrence[]` from the real client (fetch stub) and `GoogleFake`
- [x] T025 [P] [US1] Record fixtures under `packages/connectors/src/microsoft/fixtures/calendar/` (calendars list, `calendarView` full and delta, `syncStateNotFound`, `401`, `429` with `Retry-After`, recurring, all-day multi-day) and write the failing contract test `packages/connectors/src/microsoft/calendar.test.ts` for the real client and `GraphFake`
- [x] T026 [P] [US1] Write failing property tests with fast-check in `packages/core/src/panels/window.test.ts`: an occurrence appears on every display day it covers between today and today+6 in the user's zone and on no other, including one that started three days ago and ends tomorrow (FR-006); all-day events keep their calendar date and sort first; declined occurrences are hidden; tentative flag preserved; conversion from UTC and from an explicit zone
- [ ] T027 [P] [US1] Write failing API tests in `apps/api/test/panels-refresh.test.ts` (calendar): a full fetch upserts `cached_events` and deletes rows unseen; a partial (`full: false`) fetch deletes nothing; cursor stored per calendar in `account_calendars.cursor`; the same provider event id on two calendars of one account yields two rows; a `rotatedCredential` from the source is re-sealed and stored; invalid cursor forces a full fetch; `AuthError` sets `reconnect_needed` and keeps rows; rows that do not overlap yesterday..today+7 trimmed, while a row starting before yesterday but ending today survives; only `enabled` calendars fetched
- [ ] T028 [P] [US1] Write failing API tests in `apps/api/test/today.test.ts` (calendar half): events grouped by day in the user's zone, all-day first, two accounts interleaved chronologically, `stale` true when older than the tier interval, `reconnectUrl` present for a `reconnect_needed` account, paused account's events absent
- [ ] T029 [P] [US1] Write failing Playwright test `tests/e2e/tests/today.spec.ts` (ci, calendar): with the fake Google and Graph servers, an event added via the mock appears after `POST /panels/today/refresh` with the right account chip; with cached data older than two minutes (frozen clock) an event added via the mock appears within 10 s of opening `/today` (SC-002, on-open half); deleting it removes it; a recurring event shows once per day; a stale account shows the last-refresh time; axe on loading, empty, stale, reconnect and error states at 360 px and desktop
- [ ] T030 [P] [US1] Write the e2e-local spec `tests/e2e/tests/today-calendar.local.spec.ts` tagged `@local`: real Google and Microsoft test accounts, three trials per provider, event created via the provider API appears within five minutes (SC-002), timing written to the report

### Implementation

- [x] T031 [P] [US1] Implement `packages/connectors/src/google/calendar.ts` (`CalendarSource`: `calendarList.list`, `events.list` with `singleEvents=true`, `timeMin/timeMax`, `syncToken`, `attendees[self].responseStatus` → tentative/declined per the providers.md mapping (`needsAction` counts as tentative), `410` → full refetch, `401` → `AuthError`, `429` → `RateLimited`) and `packages/connectors/src/google/fake.ts` (`GoogleFake` replaying fixtures with scripted `addEvent`, `deleteEvent`, `revoke`)
- [x] T032 [P] [US1] Implement `packages/connectors/src/microsoft/calendar.ts` (`/me/calendars`, `/me/calendarView` per enabled calendar with `Prefer: outlook.timezone="UTC"`, `@odata.deltaLink` cursor, `responseStatus.response` mapping per providers.md (`notResponded` counts as tentative, `organizer` as accepted), `syncStateNotFound`/`410` → full, `429` `Retry-After` → `RateLimited`) and `packages/connectors/src/microsoft/fake.ts` (`GraphFake`, scripted mutations)
- [x] T033 [P] [US1] Implement `packages/core/src/panels/window.ts` (`expandToDays(occurrences, timeZone, today)` returning day buckets today..today+6, all-day first, declined removed) and export from `packages/core/src/index.ts`
- [ ] T034 [US1] Fill `refreshCalendar` in `apps/api/src/jobs/panels-refresh.ts`: list enabled `account_calendars`, call `fetchWindow` with the stored cursor, upsert `cached_events` on `(calendar_id, provider_event_id)`, delete unseen rows only when `full`, trim rows that do not overlap yesterday..today+7 (`ends_at < yesterday OR starts_at > today+7`), store each calendar's cursor on `account_calendars.cursor`; on connect, upsert the calendar list with the primary `enabled`
- [ ] T035 [US1] Use `expandToDays` in `apps/api/src/services/panels.ts` `todayPayload` for the `days` array and add `GET /connections/:id/calendars` (re-list from provider, upsert `account_calendars`) to `apps/api/src/routes/connections.ts`
- [ ] T036 [P] [US1] Implement the Google and Graph mock servers `infra/mocks/src/google.ts` and `infra/mocks/src/graph.ts` on top of `GoogleFake`/`GraphFake` with control routes `POST /__control/:provider/events` (add, delete) and `POST /__control/:provider/revoke` for Playwright, and expose them in `tests/e2e/fixtures/index.ts` as `mockProvider(provider)`
- [ ] T037 [US1] Complete `apps/web/src/components/today/CalendarPanel.vue` (test first in `apps/web/src/components/today/CalendarPanel.test.ts`: "Today"/"Tomorrow"/weekday headings, locale 12/24-hour times via `Intl.DateTimeFormat`, accessible link names with title, account and time and "opens in a new tab", and the connected-but-empty state "No events in the next seven days", FR-014, FR-023, FR-024): day headings today..today+6, rows with title, time range or "all day", location, tentative mark, `AccountChip`, link opening the provider in a new tab; stale state with last-refresh time, reconnect prompt per account, error copy branching on the error code in `apps/web/src/utils/errors.ts`; wire `refreshIfStale` on mount in `TodayView.vue`

**Checkpoint**: US1 independent test passes against the mocks in e2e-ci and against real Google and Microsoft accounts on the nightly `@local` run.

---

## Phase 4: User Story 2 - See what has arrived across my inboxes (Priority: P1)

**Goal**: read-only inbox panel with unread counts and the newest fifty headers per account across Microsoft, standards-based IMAP and, behind `panels.google_mail`, Google (plan Slices C mail half and D).

**Independent Test**: connect a Microsoft mailbox and a Google mailbox (`panels.google_mail` on in ci; standards-based IMAP is proved end to end in US4, T066/T067, because accounts of that kind are created by US4's form) in a test account, send each a message, confirm both appear within five minutes newest first; read one in the provider and confirm the unread count drops on the next refresh.

### Tests (write first, watch them fail)

- [ ] T038 [P] [US2] Record fixtures under `packages/connectors/src/microsoft/fixtures/mail/` (inbox delta full page with `$top=50`, incremental with one new message, `syncStateNotFound`, `401`, `429`) and write the failing contract test `packages/connectors/src/microsoft/mail.test.ts` for the real client and `GraphFake` (identical `MessageHeader[]`, preview at most 200 chars)
- [ ] T039 [P] [US2] Write the IMAP session transcript fixture `packages/connectors/src/imap/fixtures/session.txt` (LOGIN, SELECT INBOX, SEARCH UNSEEN, UID SEARCH ALL, UID FETCH with FLAGS INTERNALDATE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)], then BODY.PEEK[<n>]<0.200> for the first text part, LOGOUT; variants: wrong password, changed UIDVALIDITY, empty inbox, multipart/alternative, base64 `text/plain`, quoted-printable ISO-8859-1, HTML-only, RFC 2047 encoded subject and sender — each asserting a readable decoded preview of at most 200 characters) and the failing test `packages/connectors/src/imap/client.test.ts` running the client against the scripted fake server through both `Socket` implementations (`socket-node` for real, `socket-worker` under a minimal `connect()` shim)
- [ ] T040 [P] [US2] Record fixtures under `packages/connectors/src/google/fixtures/mail/` (`messages.list` with `labelIds=INBOX` and the category exclusion query, `messages.get?format=metadata`, `historyId` incremental, `404` history too old, `401`) and write the failing contract test `packages/connectors/src/google/gmail.test.ts`
- [ ] T041 [P] [US2] Write failing property tests in `packages/core/src/panels/merge.test.ts`: messages from N accounts interleave strictly newest first, at most fifty per account, per-account unread count equals cached unread rows unless `unreadTotal` is larger, filter by account keeps only that account's rows and count
- [ ] T042 [P] [US2] Extend `apps/api/test/panels-refresh.test.ts` (mail): full fetch replaces cache, incremental appends and trims to the newest fifty, `unread_total` stored when the provider reports one, `mail_cursor` stored, changed cursor validity forces a full fetch, `AuthError` → `reconnect_needed`; and `apps/api/test/today.test.ts` (mail half): newest first across accounts, `unreadCount` uses `unread_total` when above fifty, empty subject returned as `""`
- [ ] T043 [P] [US2] Extend `tests/e2e/tests/today.spec.ts` (ci, inbox): a Microsoft and a Google mock account (`panels.google_mail` on) interleave newest first with account chips; filter by account narrows list and count; a message marked read in the mock drops the count after refresh; empty subject renders "(no subject)"; clicking a message opens the provider link in a new tab and the row offers no other action; with `panels.google_mail` off the Google connect card offers calendar only, with it on a Google account shows mail
- [ ] T044 [P] [US2] Write the e2e-local spec `tests/e2e/tests/today-inbox.local.spec.ts` tagged `@local`: real Microsoft mailbox (Gmail added once the CASA flag is on; IMAP accounts are added by T067), three trials each, message sent via SMTP appears within five minutes (SC-002)

### Implementation

- [ ] T045 [P] [US2] Implement `packages/connectors/src/microsoft/mail.ts` (`MailSource` over `/me/mailFolders/inbox/messages/delta` with `$select=from,subject,bodyPreview,receivedDateTime,isRead,webLink`, `$top=50`, delta cursor, preview truncated to 200 chars) and extend `GraphFake` with `addMessage`, `markRead`
- [ ] T046 [P] [US2] Define the `Socket` interface in `packages/connectors/src/imap/socket.ts` (`connect({host, port, tls})` → `{ read(): Promise<Uint8Array>, write(bytes), close() }`) and implement `apps/api/src/adapters/socket-node.ts` (`node:tls`) and `apps/api/src/adapters/socket-worker.ts` (`cloudflare:sockets`), wiring the right one in `apps/api/src/node.ts` and `apps/api/src/worker.ts`; confirm `pnpm worker:build` passes
- [ ] T047 [US2] Implement the minimal read-only IMAP client `packages/connectors/src/imap/client.ts` (tagged commands, literal parsing for exactly the transcript subset, `BODYSTRUCTURE` walk to the first `text/plain` part (else `text/html`, tags stripped), quoted-printable/base64 and charset decoding, RFC 2047 header decoding, `MailSource.fetchInbox` returning `unreadTotal` from SEARCH UNSEEN and the newest fifty headers, `UIDVALIDITY:UIDNEXT` cursor, one connection per refresh closed with LOGOUT, `verify` = LOGIN + SELECT INBOX throwing `VerificationError { step: 'login' | 'inbox' }`) and the scripted server `packages/connectors/src/imap/fake-server.ts` with a `ponytail:` comment naming the supported command subset
- [ ] T048 [P] [US2] Implement `packages/connectors/src/google/gmail.ts` (`messages.list` with `labelIds=INBOX&q=-category:promotions -category:social`, `messages.get?format=metadata&metadataHeaders=From,Subject,Date`, `snippet` as preview, `historyId` cursor, history-too-old → full fetch) and extend `GoogleFake` with `addMessage`, `markRead`
- [ ] T049 [P] [US2] Implement `packages/core/src/panels/merge.ts` (`mergeMessages(byAccount, capPerAccount = 50)`, `unreadCountFor(rows, unreadTotal?)`) and export from `packages/core/src/index.ts`
- [ ] T050 [US2] Fill `refreshMail` in `apps/api/src/jobs/panels-refresh.ts`: call `fetchInbox(cred, 50, mail_cursor)`, upsert `cached_messages` on `(account_id, provider_message_id)`, replace all rows on `full`, trim to the newest fifty per account, store `unread_total` and `mail_cursor`; register the Gmail client in `apps/api/src/services/provider-registry.ts` only when `panels.google_mail` is on and add `gmail.readonly` to the Google scope set for `mail` in `apps/api/src/services/connections.ts`
- [ ] T051 [US2] Use `mergeMessages` and `unreadCountFor` in `apps/api/src/services/panels.ts` `todayPayload` for `messages` and `accounts[].unreadCount`
- [ ] T052 [P] [US2] Extend the mocks: `infra/mocks/src/graph.ts` and `infra/mocks/src/google.ts` with message control routes (`add`, `markRead`), and `infra/mocks/src/imap.ts` exposing `fake-server.ts` on port 1143 with a control route `POST /__control/imap/messages`; add `mockProvider('imap')` to `tests/e2e/fixtures/index.ts`
- [ ] T053 [US2] Complete `apps/web/src/components/today/InboxPanel.vue` (test first in `apps/web/src/components/today/InboxPanel.test.ts`: received time as time today / "Yesterday" / date with the full timestamp in `title` and the accessible name, read/unread marking, preview single-line and ellipsised at 200 characters, a `reconnect_needed` account's count kept in the total and marked possibly out of date, connected-but-empty state "No messages in your inbox", a rate-limited refresh showing when the button can be used again, FR-008, FR-009, FR-014, FR-023, FR-024): unread badge (total and per account), rows with sender, subject or "(no subject)", one-line preview, received time, `AccountChip`, link opening the provider in a new tab and nothing else; account filter driven by `filterAccountId` in `apps/web/src/stores/today.ts`; stale, reconnect and error states with code-specific copy

**Checkpoint**: US2 independent test passes for Microsoft and Google (flag on) in e2e-ci and for Microsoft nightly; the IMAP client is proved by its contract test T039 here and end to end in US4 (T066, T067); Google mail passes in ci with the flag on and stays dark in production until the CASA assessment (research §Owner decisions).

---

## Phase 5: User Story 3 - Manage connected accounts (Priority: P2)

**Goal**: Settings shows every account with status, last refresh and error; rename, recolour, pause, choose calendars, reconnect, disconnect with revoke, and account deletion wipes everything; idle purge after 30 days.

**Independent Test**: connect an account, revoke Desk's access from the provider's side, confirm Settings shows "reconnect needed" within one refresh cycle; disconnect it and confirm no cached messages or events remain and the panels update.

### Tests (write first, watch them fail)

- [ ] T054 [P] [US3] Extend `apps/api/test/connections.test.ts`: `PATCH /connections/:id` updates label and colour, `paused: true` sets `paused_at`, reports `status: 'paused'` and stops scheduling, `paused: false` marks due and restores the stored status (a paused `reconnect_needed` account resumes as `reconnect_needed`), `calendars` toggles `enabled` and enqueues a refresh; `POST /connections/:id/reconnect` answers 200 `{ url }` for OAuth providers, keeps the row and cache and replaces the credential on callback; `POST /connections/:id/refresh` marks due and rate limits; `DELETE /connections/:id` calls `revoke` first then cascades calendars, events and messages, and still deletes when `revoke` throws while writing an audit row (FR-003); `DELETE /me` revokes every account before the cascade; `GET /me/export` includes `connections: [{ provider, address, label, capabilities, status }]` and no credential or cached item (T060); audit rows for connect, reconnect, pause, disconnect, revoke failure
- [ ] T055 [P] [US3] Write failing API tests in `apps/api/test/panels-purge.test.ts`: `panels.purge` deletes every cached row of users whose `users.last_active_at` is older than 30 days and sets `cache_purged_at`; keeps `connected_accounts` and credentials; the next `GET /panels/today` for that user reports `purged: true` per account so the client shows loading, and the next `POST /panels/today/refresh` clears it; a refresh running for an account being deleted is cancelled first via `JobRunner.cancelForUser`
- [ ] T056 [P] [US3] Extend `apps/api/test/panels-refresh.test.ts`: twenty consecutive failures set status `error` and stop scheduling; a successful manual refresh or reconnect returns it to `connected`; a single failure shows no error in the Today payload
- [ ] T057 [P] [US3] Extend `tests/e2e/tests/connections.spec.ts` (ci): account list shows provider, address, capabilities, status, last refresh, last error; rename and recolour reflect in the Today chips; pause hides its items; revoking via the mock control route shows "reconnect needed" in Settings and a per-account reconnect prompt in both panels with data marked stale; disconnect removes its items from both panels; the eleventh connect is disabled with the limit shown and disconnecting one re-enables it; account deletion leaves nothing; axe on the settings page; the connect card's privacy text equals the privacy page's for the same provider (single source, T073)
- [ ] T058 [P] [US3] Extend `tests/e2e/tests/today.spec.ts` (ci): after a simulated 30-day purge (frozen clock advanced, `panels.purge` triggered via the mocks clock route) the panels show loading, not stale rows, until the refresh completes

### Implementation

- [ ] T059 [US3] Extend `apps/api/src/services/connections.ts` with `update(user, id, patch)`, `pause`/`resume`, `setCalendars`, `startReconnect` (state cookie `reconnect: id`), `disconnect` (revoke via the provider client, audit any failure, then delete row), `revokeAllForUser` (called from `DELETE /me` in `apps/api/src/routes/me.ts` before the cascade, after `JobRunner.cancelForUser`) and the status transitions per data-model.md
- [ ] T060 [US3] Add `PATCH /connections/:id`, `POST /connections/:id/reconnect` (200 `{ url }` for OAuth providers, 200 `{ needsPassword: true }` for standards), `POST /connections/:id/refresh`, `DELETE /connections/:id` to `apps/api/src/routes/connections.ts`; extend `GET /me/export` in `apps/api/src/routes/me.ts` with `connections` (provider, address, label, capabilities, status; no credentials or cached items)
- [ ] T061 [P] [US3] Implement `apps/api/src/jobs/panels-purge.ts` (daily: delete cached rows for users whose `users.last_active_at` is older than 30 days, set `cache_purged_at`, audit `purge`) and register in `apps/api/src/jobs/index.ts`; add `purged` per account to `todayPayload` in `apps/api/src/services/panels.ts` and to `packages/contracts/src/today.ts`
- [ ] T062 [US3] Complete `apps/web/src/views/ConnectionsView.vue`: per-account card with editable label, colour picker from a fixed palette of eight in `packages/ui/src/tokens.css` (each ≥ 3:1 against the panel background in both themes, asserted by a unit test over the token values; assigned in connection order by default; a radio group operable with arrow keys with named colours, FR-004, FR-024), pause/resume, calendar checklist from `GET /connections/:id/calendars`, reconnect button (navigates to the returned `url`, or opens the password dialog), an "Add mail" or "Add calendar" button on an account missing that capability (opens `/connections/:provider/start?account=<id>`, available at the ten-account limit), `?error=<code>` banner on return from the provider, disconnect with confirm dialog naming what is removed and, for Microsoft and standards accounts, the provider's own revoke instructions from `privacy-text.ts` (FR-003), status badge and last error copy from `apps/web/src/utils/errors.ts`; `?connected=<id>` card on return from the provider listing the capabilities and scopes actually granted (FR-001)
- [ ] T063 [P] [US3] Handle `purged` and `reconnect_needed` in `apps/web/src/stores/today.ts` and the `PanelFrame` usage in both panels: loading state instead of stale rows while purged, per-account reconnect prompt that links to `/settings/connections`

**Checkpoint**: US3 independent test passes; Settings and both panels share one status model; ownership matrix green for every route.

---

## Phase 6: User Story 4 - Add a provider that has no dedicated integration (Priority: P3)

**Goal**: standards-based form (IMAP and CalDAV with an app password) that verifies before saving, names the failing step, and feeds the same panels (plan Slice C standards half).

**Independent Test**: connect an Apple iCloud calendar and a Fastmail mailbox through their standard protocols and confirm the panels behave exactly as with the dedicated providers.

### Tests (write first, watch them fail)

- [ ] T079 [US4] Spike before T064 (research, no product code): against a real Yahoo account with two-step verification and an app password, confirm IMAP (`imap.mail.yahoo.com:993`) and Yahoo's CalDAV endpoint work with the read-only command subset and `REPORT calendar-query`; record the result, the preset values and any quirks in `specs/002-mail-calendar-panels/research.md` §R3, and if CalDAV fails mark the `yahoo` preset mail-only in T069 (spec Assumptions, needs `local-secrets` test account)
- [ ] T064 [P] [US4] Record fixtures under `packages/connectors/src/caldav/fixtures/` (PROPFIND current-user-principal and calendar-home-set, calendar list, REPORT calendar-query with `expand` honoured, the same without `expand` for local expansion, `sync-token` and `getctag` changes, `401`) and write the failing contract test `packages/connectors/src/caldav/client.test.ts` for the real client (fetch stub) and `CalDavFake`, including a recurring VEVENT expanded locally with `ical.js` and `PARTSTAT` → tentative/declined
- [ ] T065 [P] [US4] Extend `apps/api/test/connections.test.ts` (standards): `POST /connections/standards` with a wrong password answers 422 `verification_failed { step: 'login' }`, an unreachable host names `step: 'connect'`, a bad CalDAV URL names `step: 'discovery'`; success seals `{ password, imapHost, imapPort, caldavUrl }` and never returns it; an existing `(standards, address)` merges capabilities and replaces the credential; presets for `yahoo`, `icloud`, `fastmail` come from `GET /connections/providers`; FR-017: hosts `127.0.0.1`, `10.0.0.5`, `169.254.169.254`, `fdaa::1` and a hostname resolving to a private address answer 422 `host_not_allowed` without opening a socket, IMAP ports other than 993/143 and a non-`https` CalDAV URL answer the same, and the sixth attempt within ten minutes answers 429; at ten accounts a new address answers 409 `limit_reached` while an existing address still merges
- [ ] T066 [P] [US4] Write failing Playwright test `tests/e2e/tests/standards.spec.ts` (ci): the standards form with a preset fills host and port; wrong password shows the login-step error; success lands on Settings with the new account; the mocks IMAP and CalDAV endpoints feed both panels with the same fields as the dedicated providers; reconnect with a new password; axe on the form
- [ ] T067 [P] [US4] Extend `tests/e2e/tests/today-inbox.local.spec.ts` and `tests/e2e/tests/today-calendar.local.spec.ts` with cases tagged `@local` for the Fastmail or iCloud account (IMAP inbox and CalDAV calendar) and the Yahoo account through its preset (IMAP inbox and CalDAV calendar), three trials each

### Implementation

- [ ] T068 [P] [US4] Implement `packages/connectors/src/caldav/client.ts` (`CalendarSource`: PROPFIND discovery, calendar list, REPORT calendar-query with `expand` over the seven-day window, `ical.js` parsing, local recurrence expansion when the server ignores `expand`, the user's `PARTSTAT` mapped per providers.md (`NEEDS-ACTION` counts as tentative), `sync-token`/`getctag` cursor per calendar, `verify` = PROPFIND on the calendar home throwing `VerificationError { step: 'discovery' }`) and `packages/connectors/src/caldav/fake.ts`
- [ ] T069 [P] [US4] Add the standards presets table `packages/connectors/src/panels/presets.ts` (`yahoo`, `icloud`, `fastmail`: IMAP host and port, CalDAV URL) and surface it in `listProviders` in `apps/api/src/services/connections.ts`
- [ ] T070 [US4] Implement `createStandards(user, body)` in `apps/api/src/services/connections.ts` (FR-017 host check first: resolve and refuse non-public addresses, enforce ports 993/143 and `https` CalDAV, `RateLimiter` keys per user and per IP at five per ten minutes, ten-account limit unless merging; then verify IMAP and/or CalDAV per requested capabilities before saving, map `VerificationError.step`, seal the credential, merge on existing address, enqueue refresh) and `POST /connections/standards` in `apps/api/src/routes/connections.ts`; make `reconnect` for standards accept `{ password }` and re-verify
- [ ] T071 [P] [US4] Implement the CalDAV mock `infra/mocks/src/caldav.ts` on top of `CalDavFake` with control routes for add and delete event, and add `mockProvider('caldav')` to `tests/e2e/fixtures/index.ts`
- [ ] T072 [US4] Build `apps/web/src/components/connections/StandardsForm.vue` (preset select, address, app password with "never shown again" note, IMAP host and port, CalDAV URL, capability checkboxes, step-specific error copy) used from `apps/web/src/views/ConnectionsView.vue` for connect and for standards reconnect

**Checkpoint**: US4 independent test passes against the mocks in ci and against a real Fastmail or iCloud account nightly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: privacy text, performance and accessibility gates, verification paperwork, docs.

- [ ] T073 [P] Add the per-provider privacy section (what Desk reads, what it stores, for how long, how to revoke, exact scopes from research R6, and for standards-based IMAP the 200-byte text read used only to build the preview per FR-013) to `apps/landing/src/pages/privacy.vue` from a single source `packages/contracts/src/privacy-text.ts`, and render the same text on the connect card in `apps/web/src/views/ConnectionsView.vue` before consent (FR-016)
- [ ] T074 [P] Add the SC-005 load check `apps/api/test/today-load.test.ts`: seed one user with ten accounts at fifty messages each plus seven days of events and assert `GET /panels/today` under 500 ms server-side; add a Playwright device project run in `tests/e2e/tests/today.spec.ts` asserting render under one second, record the month view's (`/`) Lighthouse performance score on `main` before Phase 2 and assert it stays within two points (SC-005), and add `/today` and `/settings/connections` to `tests/e2e/lighthouserc.json` (performance ≥ 90, accessibility ≥ 95)
- [ ] T075 [P] Add `tests/e2e/tests/isolation-panels.spec.ts` (ci): two users each with a mock account; user B never sees user A's chips, events or messages on `/today` or `/settings/connections` (SC-003, browser-level complement to the API ownership matrix); and `/` (month view) makes no request to `/today` (FR-006)
- [ ] T076 [P] Add a `CHANGELOG.md` entry per slice and update `docs/ROADMAP.md` v2 section with the four slices and their production-flag gates; update the "Current state" section of `CLAUDE.md`; record the people-based checks (SC-001 two-minute connect, SC-007 three outsiders across two providers) with dates and results, marked `needs-rostom` in `docs/ROADMAP.md` until run
- [ ] T077 [P] Write `docs/runbooks/panels-provider-verification.md`: Google consent-screen verification for `calendar.readonly` (demo video, privacy URL), Microsoft publisher verification, CASA assessment steps and the flag flips that follow each, plus the test-account inventory for `local-secrets` (Google, Microsoft, Fastmail or iCloud, Yahoo with an app password; runner `desk-local` is registered, the environment still needs required reviewers)
- [ ] T078 Run quickstart.md end to end on the compose stack (`pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build && pnpm test:e2e -- --project=ci`) and confirm coverage on `packages/core` and `apps/api` stays at or above 85 % lines

## PR #20 review fixes (added 2026-09-26)

Collected from PR #20: seven CodeQL inline alerts and the failing `e2e-ci` job of run 36271321172. No human review comments yet. These block a green PR, so do them before the next wave.

- [x] T080 [P] Fix CodeQL "Incomplete URL substring sanitization" alerts 1–7 in `packages/connectors/src/google/calendar.test.ts` (lines 53, 103, 235, 284, 323, 359, 397): the fake-fetch router matches `url.includes('oauth2.googleapis.com') || url.includes('/token')`. Parse with `new URL(url)` and compare `hostname === 'oauth2.googleapis.com'` / `pathname === '/token'` in one shared helper at the top of the file instead of seven copies; grep `packages/connectors` for the same `includes(` host pattern in the Microsoft tests and fix any siblings. Tests must still pass unchanged in behaviour; the PR's CodeQL check must show the alerts closed
- [ ] T081 Fix `e2e-ci` failure in `tests/e2e/tests/year.spec.ts:16` and `:75` (`toHaveScreenshot`, 1362 px / 1 % diff, both light and dark, fails on retry, passes on `main`): cause is almost certainly the new flag-gated "Today" nav link in `apps/web/src/App.vue` — `panels.today` is on in the compose stack, so the year screens now render one more nav item than the baselines. Confirm against the diff image in the run's Playwright report artifact, then regenerate `tests/e2e/tests/year.spec.ts-snapshots/*-ci-linux.png` in the Linux Playwright container (never on Windows) and commit them; if the diff is anything other than the nav link, stop and report instead of updating baselines
- [x] T082 Investigate the flaky `tests/e2e/tests/auth.spec.ts:169` (`signUpAndVerify` fixture: no verification email from Mailpit within 15000 ms on the first attempt, passed on retry — it is the run's first test, so Mailpit or the API likely was not ready yet). Fix the readiness wait (global-setup health check on Mailpit) rather than raising the timeout; if it cannot be reproduced, record it as a watch item in `specs/005-fix-found-bugs/spec.md` instead
- [ ] T083 Commit the uncommitted panels-refresh wiring (`apps/api/src/app.ts`, `apps/api/src/jobs/panels-refresh.ts`, `apps/api/src/node.ts`, `apps/api/test/harness.ts`, new `apps/api/test/panels-refresh.test.ts`) once its tests pass, so the preview at https://ros-desk-pr-20.fly.dev runs it; push only when Rostom asks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no cut-over gate (moved to spec 005's final stage, 2026-09-26); T002–T005 in parallel after T001
- **Foundational (Phase 2)**: depends on Phase 1; blocks every story. T006–T010 (tests) in parallel first; T011 before T016–T020; T012–T015 in parallel with T011; T016 → T017 → T018 → T019/T020; T021–T023 after T012
- **US1 (Phase 3)**: after Phase 2. Tests T024–T030 in parallel; T031–T033 and T036 in parallel; T034 after T031/T032/T018; T035 after T033/T034; T037 after T035
- **US2 (Phase 4)**: after Phase 2; independent of US1 except sharing `TodayView.vue` (T022) and `panels-refresh.ts` (T018). Tests T038–T044 in parallel; T045, T046, T048, T049, T052 in parallel; T047 after T046; T050 after T045/T047/T048; T051 after T049/T050; T053 after T051
- **US3 (Phase 5)**: after Phase 2; exercises data produced by US1 or US2 but its API tests use the fakes directly. T054–T058 in parallel; T059 → T060; T061 and T063 in parallel with T060; T062 after T060
- **US4 (Phase 6)**: after Phase 2 and T046/T047 (IMAP client from US2). T079 (Yahoo spike) first; then T064–T067 in parallel; T068, T069, T071 in parallel; T070 after T068/T069; T072 after T070
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
- `/speckit-analyze` remediation (2026-09-26) closed D1 (`panels.today` page flag), D2 (test-first for export, `/flags`, OAuth helpers), F1 (SC-004/US3 AS-4 aligned with FR-003), C1 (`users.last_active_at` instead of KV-only sessions), C2 (event window by overlap), C3 (manual refresh clears `error`), C4 (10 s poll burst), C5 (IMAP BODYSTRUCTURE preview), C6 (FR-017 standards host restrictions); FR-017's port rule excludes self-hosted servers on custom ports, and on Workers `cloudflare:sockets` connects by hostname so DNS rebinding cannot be fully excluded there
- Second remediation pass (2026-09-26) closed the MEDIUM and LOW findings: per-calendar cursor and `(calendar_id, provider_event_id)` key (F2, F3), Microsoft refresh-token rotation re-sealed (C7), capabilities from granted scopes (C8), reconnect returns `{ url }` (C9), error codes for `last_error` (C10), US2 proved with Microsoft and Google, IMAP end to end in US4 (F4), FR-009 sorting per provider (F5), `PanelState` fallback (F6), limit allows adding a capability (E1), month-view Lighthouse bound (E2), slices aligned (F8), `feature/002-<slice>` branches (F9), SC-002 every trial (B1), fixed cap (B2), FR-010 merged and FR-013 trimmed (A1, A2), tentative mapping (B3), naming drift (F11), stale headers (F12), Yahoo in e2e-local (E3), pause as an overlay (C11)
- Google mail (T040, T048, part of T050) may merge at any time; its production flag waits for the CASA assessment recorded in ADR-0004
