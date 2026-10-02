# Spec 002 Phase 3 (US1 calendar): Wave 2 brief (T027, T034, then T028, T035)

Repo: C:\MyData\Learning\NewWorkSpace\Expenses-Dashboard, branch feature/002-mail-calendar-panels.
Docker works (Testcontainers). Commands: `pnpm --filter @desk/api test -- <file filter>`,
`pnpm --filter @desk/api typecheck`, `pnpm worker:build` (from repo root), `npx eslint <files>`.

## Rules
- Test first: write each failing test file, RUN it, see it fail for the expected reason, then implement.
- Forbidden in tests: `expect(true)`, `expect([a,b]).toContain(x)` when an exact value is checkable,
  truthy/`toBeDefined` as the only assertion, swallowed errors (`try {} catch {}`, `.catch(() => {})`),
  asserting only `status === 200`. Assert DB state with SELECTs and exact values.
- Never `git add/commit/stash/checkout/push`. The main session commits.
- When editing files with a script on Windows, keep LF endings (Python: `newline=''`). Prefer the Edit tool.
- No new dependencies. Code in apps/api must stay Workers-compatible (no node: imports outside node.ts/adapters).
- Report: files changed, which tests went red then green, exact command results, anything open or any design
  question (don't guess on design; list it).

## Context to read first
- specs/002-mail-calendar-panels/data-model.md (account_calendars, cached_events), contracts/api.md (Today
  payload, GET /connections/:id/calendars), contracts/providers.md.
- packages/connectors/src/panels/index.ts: `CalendarSource`; `fetchWindow` returns
  `{ events, deletedIds?, cursor?, full, rotatedCredential? }`.
- packages/connectors/src/google/calendar.ts, microsoft/calendar.ts: factories
  `createGoogleCalendarSource({ clientId, clientSecret, apiBase, oauthEndpoints?, fetchImpl })` and
  `createMicrosoftCalendarSource(...)` (same args). Exports `@desk/connectors/google/calendar`, `/microsoft/calendar`.
- apps/api/src/lib/credential.ts: `sealCredential(box, { refreshToken })` → Uint8Array,
  `openCredential(box, bytes)`, `googleOAuthEndpoints(base?)`, `microsoftOAuthEndpoints(base?)`.
- apps/api/src/jobs/panels-refresh.ts (skeleton with stubs and a WRONG re-seal using Buffer hex: replace it),
  apps/api/src/services/panels.ts (`todayPayload`), apps/api/src/routes/connections.ts, apps/api/src/app.ts
  (AppDeps, panelsRefreshJob registration, googleOAuthEndpoints/microsoftOAuthEndpoints deps),
  apps/api/src/node.ts (how env reaches AppDeps: `googlePanels`, `microsoft`, `GOOGLE_API_BASE`, `GRAPH_API_BASE`),
  apps/api/test/harness.ts (startHarness options, TestClock, `TEST_SECRET_BOX_KEY`), apps/api/test/panels-scheduler.test.ts
  and connections.test.ts (how tests seed accounts and run jobs), apps/api/test/ownership.test.ts (it.todo rows).
- packages/core: `expandToDays(occurrences, timeZone, today)` → 7 `{ date: 'YYYY-MM-DD', events }` buckets;
  `localDate(d, tz)`.
- packages/db/src/schema.ts: accountCalendars, cachedEvents, connectedAccounts.

## Part A: T027 tests, then T034 refreshCalendar

Wiring (decided):
- `PanelsRefreshDeps` gains `calendarSources: Partial<Record<'google' | 'microsoft', CalendarSource>>`.
- `AppDeps` gains optional `calendarSources`. In `createApp`, when absent, build real ones: Google only when
  `deps.googlePanels` is set (apiBase from a new optional AppDeps field `googleApiBase`, default
  `https://www.googleapis.com`, oauthEndpoints = deps.googleOAuthEndpoints, fetchImpl = globalThis.fetch);
  Microsoft likewise with `graphApiBase` default `https://graph.microsoft.com`. node.ts passes
  `googleApiBase: env.GOOGLE_API_BASE`, `graphApiBase: env.GRAPH_API_BASE`. worker.ts needs nothing (defaults).
- harness: `startHarness` accepts `calendarSources` and forwards it. Keep existing call sites working.
- A provider with no source (not configured) → treat as a normal failure (ProviderError path), don't crash.

refreshCalendar behaviour, only when account.capabilities includes 'calendar':
1. If the account has zero account_calendars rows: `listCalendars(cred)`, insert all (primary `enabled: true`,
   others false, name, isPrimary, colour).
2. For each `enabled` calendar: `fetchWindow(cred, [providerCalendarId], from, to, calendar.cursor ?? undefined)`
   with from = now − 1 day, to = now + 8 days (covers yesterday..today+7 in any zone).
3. Upsert cached_events on (calendar_id, provider_event_id) with all fields, seen_at = now.
   Declined occurrences are NOT stored (skip them).
4. If `full`: delete that calendar's rows whose provider_event_id is not in this result.
   Else: delete that calendar's rows whose provider_event_id is in `deletedIds`.
5. Store the returned cursor on that calendar row (null if none).
6. After all calendars: delete the account's rows where `ends_at < now − 1 day OR starts_at > now + 8 days`.
7. The last `rotatedCredential` seen wins; the job re-seals it with `sealCredential` BEFORE writing the cache,
   replacing the old Buffer-hex code. The job opens the credential once with `openCredential`.
Errors keep the existing handling in the job (AuthError → reconnect_needed and rows kept, etc.).

T027 failing tests in `apps/api/test/panels-refresh.test.ts`, with an in-file fake CalendarSource that records
calls and returns scripted results per calendar id (harness clock fixed at e.g. 2026-10-05T12:00Z):
- first refresh lists calendars and inserts them, primary enabled, the other disabled (exact rows).
- full fetch upserts rows (exact titles/times) and deletes a pre-seeded row not in the result.
- partial fetch (full: false) keeps an unseen pre-seeded row and deletes the one named in deletedIds.
- each calendar's cursor stored on its own row (two enabled calendars, two distinct cursors); next refresh passes
  the stored cursor back (assert the fake's recorded cursor arg).
- same providerEventId on two calendars of one account → two rows.
- only enabled calendars are fetched (fake's recorded calendarIds exclude the disabled one).
- rotatedCredential { refreshToken: 'rt-new' } → credential_enc opens (openCredential) to exactly that.
- AuthError → status reconnect_needed, last_error access_revoked, cached_events count unchanged.
- trim: a row ending before now−1d is deleted; a row starting 3 days ago and ending tomorrow survives;
  a row starting after now+8d is deleted.
- declined occurrences are not stored.
- an account without the 'calendar' capability never calls the source.

## Part B: T028 tests, then T035

todayPayload (services/panels.ts):
- Read cached_events for the user's accounts that are NOT paused, whose calendar is enabled, with
  starts_at < now + 8d AND ends_at > now − 1d; expandToDays then filters to the 7 days.
- Map rows to the TodayResponse event shape in packages/contracts/src/today.ts (read it). Feed
  `expandToDays(events, user.timeZone, now)`; `days` = its buckets (still `[]` when the user has no accounts,
  per the existing contract).
- `reconnectUrl` on an account with status reconnect_needed: follow contracts/today.ts and contracts/api.md
  (report if unclear).
- Keep expandToDays's in-bucket order (all-day first, then startsAt).

GET /connections/:id/calendars (routes/connections.ts): ownership via the existing `assertOwned` pattern (404
not_found for another user's id), open the credential, `listCalendars`, upsert account_calendars on
(account_id, provider_calendar_id) preserving `enabled` for existing rows (new non-primary rows disabled, new
primary enabled), respond with the contracts/api.md shape (check packages/contracts/src/connections.ts `Calendar`).
Thread `calendarSources` and `secretBox` through ConnectionsRouteDeps from app.ts.
AuthError from the provider → mark the account reconnect_needed and answer per contracts/api.md (report if unspecified).

T028 failing tests in `apps/api/test/today.test.ts` (seed accounts/calendars/events directly):
- events grouped into the right day in the user's zone (users.time_zone = America/Los_Angeles, event at
  2026-10-06T05:30Z → under 2026-10-05); all-day first; two accounts interleaved by start time.
- an event that started three days ago and ends tomorrow appears on today and tomorrow (FR-006).
- paused account's events absent; disabled calendar's events absent.
- stale true when last_refresh_at older than 5 min for an active user; false when fresh.
- reconnect_needed account carries reconnectUrl; its cached events still appear.
- ownership.test.ts: replace the `GET /connections/:id/calendars` it.todo with a real row (user A against user B's
  account id → 404, error code not_found).
Also a route test for GET /connections/:id/calendars: upsert preserves an existing enabled flag and adds a new calendar.

## Finally
Run: `pnpm --filter @desk/api test` (FULL api suite, green except it.todo), `pnpm --filter @desk/api typecheck`,
`pnpm worker:build`, eslint on changed files. Report counts.
