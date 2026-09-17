# Research: Mail and Calendar Panels

Date: 2026-09-17. Resolves every unknown in the plan's Technical Context. Provider facts are
stated as of the planning date and are re-verified in the first task of each slice, since
provider programmes change.

## R1. Google access: calendar now, mail behind a flag

- **Decision**: separate OAuth connection flow from sign-in, requesting `calendar.readonly`
  for calendar connections and `gmail.readonly` for mail connections, with `access_type=offline`
  and `prompt=consent` so a refresh token is issued; `include_granted_scopes` is not used so the
  sign-in grant stays `openid email profile`. Calendar events via `events.list` with
  `singleEvents=true`, `timeMin`/`timeMax` for the seven-day window and `syncToken` for
  incremental refresh. Mail via `messages.list` on the `INBOX` label with `q=-category:promotions
  -category:social` and `messages.get?format=metadata` for `From`, `Subject`, `Date` and the
  `snippet`; `users.history.list` with `startHistoryId` for incremental refresh. Google mail is
  gated by feature flag `panels.google_mail`, off in production until the restricted-scope
  verification passes.
- **Rationale**: `calendar.readonly` is a sensitive scope (standard verification);
  `gmail.readonly` is restricted (verification plus CASA), so the two must be separate consents
  and separately gated. `format=metadata` returns headers and the snippet without the body,
  which is exactly FR-012. `singleEvents=true` makes Google expand recurrences, satisfying
  scenario 5 without recurrence logic in Desk.
- **Alternatives considered**: `googleapis` SDK (Node-only, fails `worker-build`);
  `gmail.metadata` scope (also restricted, and its `q` support is limited); Pub/Sub push for
  mail (needs a public topic per project; polling within five minutes is enough).

## R2. Microsoft access through Graph

- **Decision**: one multi-tenant app registration on the `common` endpoint; scopes `Mail.Read`
  (inbox), `Calendars.Read` and `offline_access`; PKCE authorization-code flow with the same
  hand-written OAuth helper as Google (research R3 of the baseline). Mail via
  `/me/mailFolders/inbox/messages/delta?$select=from,subject,bodyPreview,receivedDateTime,isRead
  &$top=50`, keeping the `@odata.deltaLink` as the cursor; the "Focused/Other" split is ignored
  (both are the inbox). Calendar via `/me/calendarView?startDateTime&endDateTime` with
  `Prefer: outlook.timezone="UTC"`, which expands recurrences; calendar list via
  `/me/calendars`.
- **Rationale**: delta queries give incremental inbox refresh for free; `calendarView` expands
  series; `$select` keeps bodies out of the response. Publisher verification is required for
  multi-tenant consent prompts to look trustworthy and is a documentation step, not a code one.
- **Alternatives considered**: Graph SDK (heavy, Node-leaning); change notifications (webhooks
  need a public endpoint and renewals; polling meets the five-minute promise).

## R3. Standards-based providers: IMAP on both runtimes, CalDAV over fetch

- **Decision**: `MailSource` and `CalendarSource` interfaces in `packages/connectors/panels`.
  CalDAV client over `fetch`: `PROPFIND` for discovery (`current-user-principal`,
  `calendar-home-set`, calendars with `supported-calendar-component-set` containing VEVENT),
  then `REPORT calendar-query` with `<C:expand start end>` for the seven-day window and
  `ical.js` to parse the returned VEVENTs; `getctag`/`sync-token` as the cursor. IMAP client
  written in-repo as a minimal read-only subset over a `Socket` interface (`connect(host, port,
  tls)`, `write`, `readLine`, `close`): `LOGIN`, `SELECT INBOX`, `SEARCH UNSEEN` (count),
  `UID SEARCH` for the newest fifty, `UID FETCH ... (FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS
  (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.200>)` for the preview, `UIDNEXT`/`UIDVALIDITY` as the
  cursor. `Socket` has a Node implementation on `node:tls` and a Workers implementation on
  `cloudflare:sockets` `connect()`. Credentials are the user's app password, sealed with
  `SecretBox`. Connection is verified (login plus `SELECT INBOX`, or `PROPFIND`) before the row
  is saved. Yahoo, Apple iCloud and Fastmail are documented presets (host and port prefilled).
- **Rationale**: CalDAV is HTTP, so it runs anywhere; servers that support `expand` do the
  recurrence work (iCloud, Fastmail, Nextcloud do; when a server ignores `expand`, `ical.js`'s
  recurrence iterator expands locally). IMAP is the only protocol here that needs TCP, and the
  read-only subset the panel needs is about 300 lines, small enough to own and to test against a
  scripted fake server; owning it is what makes the standards connector Workers-compatible.
- **Alternatives considered**: `imapflow` or `node-imap` (Node-only, fail `worker-build`;
  wrapping them with "Workers later" violates Principle II); JMAP (Fastmail only); skipping IMAP
  and offering standards-based calendar only (drops Yahoo mail, which ADR-0004 lists).

## R4. Refresh scheduling and cursors

- **Decision**: one `panels.refresh` job per connected account, enqueued by a
  `panels.scheduler` tick every minute that selects accounts whose `next_refresh_at` has
  passed. `next_refresh_at` is computed by `packages/core/panels/refresh-policy.ts`: five
  minutes after the last refresh if the owner has a session seen in the last 24 hours, one hour
  otherwise; doubled per consecutive failure up to one hour; paused after twenty failures.
  `POST /today/refresh` sets `next_refresh_at = now` for every unpaused account of the user
  whose last refresh is older than two minutes and returns immediately; the Today page polls
  `GET /today` every ten seconds for thirty seconds after triggering, then every sixty seconds
  while visible. Each refresh uses the provider cursor (Google `syncToken`/`historyId`, Graph
  `deltaLink`, IMAP `UIDVALIDITY`+`UIDNEXT`, CalDAV `sync-token`/`ctag`) and falls back to a
  full window fetch when the provider reports the cursor invalid. Cached rows not seen in a
  full fetch are deleted.
- **Rationale**: reuses the baseline jobs runner and its `SKIP LOCKED` claiming; activity
  tiers implement the owner's refresh decision without a second scheduler; cursors keep each
  refresh to one or two small requests, which is what keeps provider quota use low at the cap.
- **Alternatives considered**: provider push notifications (public endpoints, renewals, and
  three different mechanisms); refreshing only while the page is open (breaks the five-minute
  promise for active users who are on another page).

## R5. Storage, caps, retention

- **Decision**: four tables (data-model.md). `cached_messages` keeps sender name and address,
  subject, a preview truncated to 200 characters, received time, unread flag, provider id and
  open link; after each refresh rows beyond the newest fifty per account are deleted.
  `cached_events` keeps only occurrences between yesterday and seven days ahead. A daily
  `panels.purge` job deletes all cached rows of users with no session seen in 30 days and marks
  their accounts `cache_purged_at` so the next visit triggers a full refresh with a loading
  state. Disconnect deletes the account row (cascading its cache) after revoking at the
  provider; `DELETE /me` gains a step that revokes every connection before the user cascade.
- **Rationale**: matches FR-012 and the retention clarification exactly; the purge is a
  single delete per user, not per row; revoking before deleting means a failed revoke is
  visible (the account shows an error) rather than silently leaving a live grant behind.
- **Alternatives considered**: keeping bodies for search (out of scope, and it changes the
  privacy statement); per-row TTLs (more churn for no benefit).

## R6. Scopes, verification and privacy text

- **Decision**: exact provider scopes recorded here and mirrored on the connect screen and the
  privacy page: Google `https://www.googleapis.com/auth/calendar.readonly` and
  `https://www.googleapis.com/auth/gmail.readonly`; Microsoft `Calendars.Read`, `Mail.Read`,
  `offline_access`, `User.Read`; standards-based: the app password the user supplies.
  Prerequisites tracked as tasks: product name and domain (ADR-0002), privacy page (Phase 4),
  Google OAuth consent screen in production mode with a demo video, Microsoft publisher
  verification, CASA assessment at the tier Google assigns. Per-provider feature flags:
  `panels.google_calendar`, `panels.google_mail`, `panels.microsoft`, `panels.standards`.
- **Rationale**: verification reviewers compare the requested scopes with the privacy text and
  the demo; keeping one source of truth avoids a failed review. Flags let each provider go live
  when its own gate passes.
- **Alternatives considered**: a single "panels" flag (would hold everything back for Google
  mail); requesting mail and calendar in one Google consent (mixes a sensitive and a restricted
  scope, so the whole grant would wait for CASA).

## R7. Quotas, throttling and backoff

- **Decision**: Google Calendar and Gmail per-user quotas are generous at one to two requests per
  refresh; Graph throttles with `429` and `Retry-After`, honoured by the shared HTTP helper; IMAP
  servers limit simultaneous connections per account (Yahoo and iCloud allow few), so each
  refresh opens one connection and closes it. Failures increment `consecutive_failures` and
  double the interval (R4); a `401`/`invalid_grant` sets status `reconnect_needed` immediately
  instead of retrying. Per-user refresh triggers are rate-limited to one per minute via the
  existing `RateLimiter`.
- **Rationale**: cursors make the happy path one request; the backoff and the twenty-failure
  pause (spec assumption) bound quota use for broken accounts.
- **Alternatives considered**: global concurrency limiter (not needed at 1,000 users).

## R8. Time zones, all-day and multi-day events

- **Decision**: providers return expanded occurrences with start and end in UTC or with an
  explicit zone; `packages/core/panels/window.ts` converts to the user's `time_zone` (from
  the baseline users table) and assigns each occurrence to every display day it covers between
  today and today plus six; all-day events carry a date, not a time, and are listed first on
  their day; tentative status maps from Google `attendees[self].responseStatus`, Graph
  `responseStatus`, CalDAV `PARTSTAT`. Declined events are hidden.
- **Rationale**: pure function, property-testable (an event never appears on a day it does not
  cover; every covered day within the window lists it once).
- **Alternatives considered**: computing the window in the provider's zone (wrong for users
  who travel); showing declined events (noise).

## R9. Today page behaviour

- **Decision**: `GET /today` returns both panels in one payload (events grouped by day, messages
  newest first with per-account unread counts, per-account status, `refreshedAt` per account,
  a `stale` flag when older than the tier's interval). The page renders cached data immediately,
  calls `POST /today/refresh` on open when any account's data is older than two minutes, and
  polls as in R4. Each panel has loading, empty, stale, reconnect-needed and error states from
  the baseline `PanelState` component; account chips carry label and colour; filtering by
  account is client-side. The month view does not import the today store.
- **Rationale**: one request keeps SC-005 achievable; cached-first rendering makes the on-open
  refresh invisible unless something changed.
- **Alternatives considered**: server-sent events for refresh completion (a second transport
  for a ten-second gain).

## R10. Testing strategy

- **Decision**: unit and property tests for `window.ts`, `merge.ts` and `refresh-policy.ts`;
  recorded fixtures per provider (Google events.list and messages.list, Graph delta and
  calendarView, CalDAV PROPFIND and REPORT responses, an IMAP session transcript) with fakes
  validated against the same fixtures; the IMAP client tested against a scripted in-memory
  server implementing the same transcript; API suite covers every connection route with the
  ownership matrix and the revoke-before-delete rule; `infra/mocks` gains fake Google, Graph,
  CalDAV and IMAP servers used by compose and e2e-ci; e2e-local nightly runs against real test
  accounts (one Google, one Microsoft, one Fastmail or iCloud) with three trials per provider
  for SC-002; axe and Lighthouse on the Today page and Connections settings.
- **Rationale**: the constitution's pyramid; real accounts cannot run in CI, so the recorded
  fixtures are the contract and the nightly run proves them against reality.
- **Alternatives considered**: mocking at the HTTP layer only (would not exercise the IMAP
  socket adapters).

## Owner decisions and prerequisites this plan depends on

| Item | Status | Needed by |
|------|--------|-----------|
| ADR-0004 accepted | Done (2026-09-17) | Slice A |
| Product name, domain, privacy page (ADR-0002, Phase 4) | Pending | Google and Microsoft verification, slices B and D |
| Google OAuth consent screen verified for `calendar.readonly` | Pending | Slice B production flag |
| Microsoft app registration and publisher verification | Pending | Slice B and C production flags |
| CASA assessment for `gmail.readonly` | Pending, budgeted in ADR-0004 | Slice D production flag |
| Test accounts for e2e-local (Google, Microsoft, Fastmail or iCloud) | Pending | Slice B nightly |
