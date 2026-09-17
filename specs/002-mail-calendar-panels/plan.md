# Implementation Plan: Mail and Calendar Panels

**Branch**: `002-mail-calendar-panels` (spec); delivery on `v2/mail-calendar-*` branches after the Phase 6 cut-over | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-mail-calendar-panels/spec.md`

## Summary

A new "Today" page shows a seven-day calendar panel and a read-only inbox panel across up to ten
connected accounts per user from Google, Microsoft and any standards-based provider (IMAP and
CalDAV with an app password). Each connection is a row with its own encrypted credential, granted
capabilities and refresh cursor, separate from sign-in. A `panels.refresh` job on the existing
jobs runner pulls headers-only mail and a rolling seven-day event window per account, every five
minutes for recently active users and hourly otherwise, with an on-open refresh. All provider
clients are `fetch`-based except IMAP, which runs on a small socket abstraction with Node and
Workers implementations so the standards-based connector passes `worker-build`. Google mail is
behind a per-provider feature flag until the restricted-scope assessment passes (ADR-0004).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node 22 LTS, pnpm 12 workspaces; unchanged from
the baseline.

**Primary Dependencies**: everything from the baseline plan (Hono, Vue 3, Drizzle, zod, jose,
hash-wasm). Added here: `ical.js` (iCalendar parsing, pure JS, Workers-safe) for CalDAV; no
Google or Microsoft SDKs (plain `fetch` against their REST APIs); no IMAP library (a minimal
read-only IMAP client over a `Socket` interface, see research R3). All must pass `worker-build`.

**Storage**: Postgres tables `connected_accounts`, `account_calendars`, `cached_events`,
`cached_messages` (see data-model.md); credentials sealed with the existing `SecretBox`; no
browser storage beyond the existing session and offline queue.

**Testing**: Vitest unit tests for the pure merge/window logic in `packages/core`, recorded
fixtures and fakes per provider client in `packages/connectors`, API suite with Testcontainers
including the ownership matrix for every new route, Playwright `ci` against the mocks container
(fake Google, Graph, IMAP and CalDAV servers), Playwright `local` nightly against real test
accounts on the `desk-local` runner, axe and Lighthouse on the Today page.

**Target Platform**: as the baseline (Fly Node container now, Cloudflare Workers later, PWA at
360 px and up). The IMAP socket abstraction is the only runtime-specific code.

**Project Type**: web application monorepo; this feature adds one page, one settings section, two
connector families and one job.

**Performance Goals**: Today page under one second at the cap (ten accounts, fifty messages
each, seven days of events); on-open refresh visible within ten seconds; five-minute freshness
for active users; refresh of one account under five seconds on the provider's happy path.

**Constraints**: read-only provider scopes only; headers and preview only, never bodies or
attachments; ten accounts per user; fifty messages per account; seven-day window; 30-day idle
purge; per-provider feature flags; Google mail dark until CASA; every route scoped by user;
English UI; provider quota respected with backoff and a twenty-failure pause.

**Scale/Scope**: 1,000 users × up to ten accounts = at most 10,000 refresh jobs per five
minutes worst case, realistically a few hundred active; one new page, one settings section, ~14
routes, four provider clients, one job with a scheduler tick.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Before research | After design |
|-----------|------|-----------------|--------------|
| I. Test-First | Every story has an independent test in the spec; each provider client ships with recorded fixtures and a fake validated against them; every new route enters the ownership matrix | Pass | Pass (quickstart.md names the proving test per story) |
| II. One Codebase, Two Runtimes | Google, Microsoft and CalDAV clients are `fetch`-only; IMAP needs TCP, so it sits behind a `Socket` interface with `node:tls` and `cloudflare:sockets` implementations, both in the same PR; `ical.js` is pure JS | Pass, with the IMAP condition | Pass (research R3, both socket adapters listed in data flow) |
| III. Money Is Exact | No money in this feature; FR-013 forbids any link to expenses | Pass (not applicable) | Pass |
| IV. Every User Is an Island | Every new table has `user_id` with cascade; connections and cached items are queried by owner; account deletion revokes provider access before the cascade | Pass | Pass (data-model.md cascade section; `DELETE /me` extension) |
| V. Decide Once, Write It Down | ADR-0004 records the reversal of ADR-0001's Gmail decision; provider scopes, retention and refresh policy are recorded in the spec's Clarifications | Pass | Pass (research R6 lists the exact scopes per provider) |
| VI. Simplicity and Finished Surfaces | No SDKs where `fetch` suffices; one job, not a queue; Today page has loading, empty, stale, reconnect and error states per panel; each provider behind a flag | Pass | Pass (Complexity Tracking: one justified item, the IMAP client) |

## Project Structure

### Documentation (this feature)

```text
specs/002-mail-calendar-panels/
├── plan.md              # This file
├── research.md          # Phase 0: provider access, IMAP on Workers, refresh scheduling, retention
├── data-model.md        # Phase 1: four tables, states, cascade rules
├── quickstart.md        # Phase 1: proving each story
├── contracts/
│   ├── api.md           # Today and connections routes
│   └── providers.md     # What each provider client must expose; fixture and fake rules
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── views/TodayView.vue                 # calendar panel + inbox panel, per-panel states
├── views/ConnectionsView.vue           # settings section: list, connect, standards form, edit
├── components/today/CalendarPanel.vue, InboxPanel.vue, AccountChip.vue, PanelState.vue
└── stores/today.ts                     # fetches /today, polls while visible, triggers refresh

apps/api/src/
├── routes/today.ts                     # GET /today, POST /today/refresh
├── routes/connections.ts               # OAuth start/callback per provider, standards create,
│                                       #   PATCH/DELETE, calendars list, reconnect
├── services/connections.ts             # create/link/pause/disconnect, revoke at provider
├── services/panels.ts                  # read cached rows for the Today payload
├── jobs/panels-refresh.ts              # per-account refresh: pull, diff, write cache, cursor
├── jobs/panels-scheduler.ts            # enqueues due accounts by user activity tier
├── jobs/panels-purge.ts                # 30-day idle purge, per-account cap trim
└── adapters/socket-node.ts, socket-worker.ts   # Socket interface for IMAP

packages/connectors/src/
├── google/     # calendar (events.list, singleEvents) and gmail (messages.list + metadata) clients, fake, fixtures
├── microsoft/  # Graph calendarView and inbox delta clients, fake, fixtures
├── caldav/     # discovery, calendar-query with expand, ical.js parsing, fake, fixtures
├── imap/       # minimal read-only client over Socket, fake, recorded session fixtures
└── panels/     # provider-agnostic MailSource and CalendarSource interfaces

packages/core/src/panels/
├── window.ts            # seven-day window, all-day and multi-day expansion into display days
├── merge.ts             # interleave events and messages across accounts, cap per account
└── refresh-policy.ts    # active vs idle tier, next-due computation, backoff

packages/contracts/src/today.ts, connections.ts   # zod schemas for the routes above
packages/db/src/schema.ts                         # four new tables; migration `panels`
infra/mocks/src/{google,graph,caldav,imap}.ts     # fakes exposed to compose and e2e-ci
tests/e2e/tests/{today,connections}.spec.ts       # ci project; `@local` nightly variants
```

**Structure Decision**: the feature is added inside the existing layout. Provider clients are
new folders under `packages/connectors` following the rates and Notion pattern (real client,
fake, recorded fixtures). Pure logic (window, merge, refresh policy) goes to `packages/core` so
it is tested without I/O. The only runtime-specific code is the two socket adapters.

## Phase Delivery Map

| Slice | Spec stories | Ships | Gate |
|-------|--------------|-------|------|
| A. Connections and Today shell | US3 | tables, connection routes, Settings section, Today page with empty states, scheduler and purge jobs, flags per provider | ownership matrix, connections API suite, Playwright empty states |
| B. Calendar: Google and Microsoft | US1 | Google calendar and Graph calendarView clients, `panels.refresh` for calendar, CalendarPanel | fixtures + fakes, window unit tests, Playwright calendar with mocks, e2e-local nightly |
| C. Inbox: Microsoft and standards | US2, US4 | Graph inbox delta, IMAP over Socket (both adapters), CalDAV, standards form, InboxPanel | IMAP fake session tests, worker-build with the Workers socket adapter, Playwright inbox and standards form |
| D. Google mail | US2 | Gmail client behind flag `panels.google_mail`; enabled after the assessment passes | fixtures + fake, e2e-local against a test Gmail once verification completes |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Own minimal IMAP client over a `Socket` interface (Principle VI: build the smallest thing) | Standards-based mail (US4, and Yahoo per ADR-0004) needs IMAP; every published IMAP library is Node-only and would fail `worker-build`, which Principle II forbids without a Workers-compatible implementation | Node-only library wrapped behind an interface with "Workers later" was rejected because the constitution requires the second implementation in the same PR; running standards-based refresh on a Node-only machine in Stage 2 would keep a Fly machine alive purely for this and split the job runner in two |
