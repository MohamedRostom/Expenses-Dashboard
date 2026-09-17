# Quickstart: proving the Mail and Calendar Panels

Builds on the baseline quickstart (`specs/001-phased-product-baseline/quickstart.md`); the same
compose stack and commands apply. New environment variables: `GOOGLE_PANELS_CLIENT_ID` and
`GOOGLE_PANELS_CLIENT_SECRET` (a separate OAuth client from sign-in so scopes and verification
are independent), `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`; in compose the mocks
container provides `GOOGLE_API_BASE`, `GRAPH_API_BASE`, `CALDAV_TEST_URL` and `IMAP_TEST_HOST`.
Flags `panels.*` are on in local and e2e-ci.

```sh
docker compose -f infra/docker-compose.yml up --build --wait
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build
pnpm test:e2e -- --project=ci
```

## Slice A: connections and the Today shell (US3)

1. API suite `apps/api/test/connections.test.ts`: OAuth start refused at ten accounts, callback
   creates or merges a row and seals the credential, standards create verifies before saving and
   returns `verification_failed` with the step, PATCH label, colour, pause and calendars,
   reconnect keeps the cache, DELETE revokes then cascades, `DELETE /me` revokes every account;
   ownership matrix extended with every route in `contracts/api.md`.
2. Unit tests `packages/core/src/panels/refresh-policy.test.ts`: active tier five minutes, idle
   tier one hour, backoff doubling, pause at twenty failures, on-open trigger only when older
   than two minutes.
3. Playwright `tests/e2e/tests/connections.spec.ts`: Settings shows providers per flag, the
   empty Today page explains connecting, the eleventh connect is disabled with the limit shown.
4. Expected outcome: Today page and Connections settings exist with all states; no provider
   data yet.

## Slice B: calendar for Google and Microsoft (US1)

1. Contract tests `packages/connectors/src/google/calendar.test.ts` and
   `packages/connectors/src/microsoft/calendar.test.ts` against fixtures (full window,
   incremental, invalid cursor, revoked, recurring, all-day multi-day); fakes pass the same.
2. Property tests `packages/core/src/panels/window.test.ts`: an occurrence appears on every
   display day it covers and on no other; all-day first; declined hidden; conversion to the
   user's zone.
3. API test `apps/api/test/panels-refresh.test.ts`: refresh writes cached events, deletes
   unseen rows on a full fetch, honours cursors, sets `reconnect_needed` on a 401.
4. Playwright `tests/e2e/tests/today.spec.ts` (ci): with the fake Google and Graph servers, an
   event added via the fake appears after `POST /today/refresh` with the right account chip;
   deleting it removes it; a recurring event shows once per day.
5. e2e-local `today-calendar.spec.ts` tagged `@local`: real Google and Microsoft test
   accounts, three trials per provider per night, five-minute propagation (SC-002).
6. Expected outcome: US1 independent test passes against both providers.

## Slice C: inbox for Microsoft and standards-based providers (US2, US4)

1. Contract tests for Graph inbox delta and for IMAP (client against the scripted fake server:
   login, unread total, newest fifty, preview truncation, `UIDVALIDITY` change forces full
   fetch) and CalDAV (discovery, expand, local expansion fallback).
2. `pnpm worker:build` must succeed with the Workers socket adapter in the bundle; a unit test
   runs the IMAP client against the fake server through both `Socket` implementations (the
   Workers one under a minimal `connect()` shim in tests).
3. API tests: standards create with wrong password names the login step; merge of an existing
   address adds the capability; unread badge uses `unreadTotal` when above fifty.
4. Playwright (ci): standards form with the mocks IMAP and CalDAV endpoints; inbox panel
   interleaves two accounts newest first; filter by account; a message marked read in the fake
   drops the count on refresh; return after a simulated 30-day purge shows loading, not stale
   rows.
5. e2e-local: real Microsoft mailbox and one Fastmail or iCloud account, nightly.
6. Expected outcome: US2 passes for Microsoft and standards; US4 passes.

## Slice D: Google mail (US2, behind `panels.google_mail`)

1. Contract test for `messages.list` plus `messages.get?format=metadata` fixtures and
   `historyId` incremental fetch; fake passes the same.
2. Playwright (ci) with the flag on: Google account shows mail; with the flag off: the Google
   connect screen offers calendar only and explains why.
3. After Google verification and the CASA assessment pass: flag on in production, e2e-local
   nightly against a test Gmail.
4. Expected outcome: full US2 across all providers; SC-002 three consecutive green nights.

## Cross-slice gates

- Lighthouse on `/today` and `/settings/connections`: performance at least 90, accessibility at
  least 95; axe on every panel state.
- SC-005 load check: seed a user with ten accounts at the caps and assert the Today response
  under 500 ms server-side and render under one second on the device project.
- Coverage on `packages/core` and `apps/api` stays at or above 85 % lines.
