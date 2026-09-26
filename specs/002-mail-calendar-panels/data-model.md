# Data Model: Mail and Calendar Panels

Extends the baseline schema (`specs/001-phased-product-baseline/data-model.md`) with four tables
in one migration named `panels`. Conventions as before: `id uuid` primary keys, `user_id uuid NOT
NULL REFERENCES users(id) ON DELETE CASCADE` on every table, timestamps in `timestamptz`, an index
starting with `user_id` on every table. No table here references the expense tables (FR-013).

## connected_accounts

- `id`, `user_id`, `provider text` (`google` | `microsoft` | `standards`), `address text` (stored lowercased; the repo has no `citext`),
  `label text` (defaults to the address), `colour text`, `capabilities text[]` (`mail`,
  `calendar`, one or both), `granted_scopes text[]`, `credential_enc bytea` (AES-256-GCM via
  `SecretBox`: refresh token, or app password plus host and port for standards; re-sealed
  whenever the provider rotates the refresh token, as Microsoft does on every exchange),
  `status text` (`connected` | `reconnect_needed` | `error`), `paused_at timestamptz NULL`
  (non-null means paused; the API reports `status: 'paused'` while it is set and the stored
  status is kept for resume, FR-004), `last_refresh_at timestamptz NULL`, `last_error text NULL`
  (an error code from `packages/contracts/src/errors.ts`: `provider_unreachable`,
  `access_revoked`, `rate_limited`, `login_failed`, `host_not_allowed`; never provider text),
  `consecutive_failures int DEFAULT 0`, `next_refresh_at timestamptz NOT NULL`,
  `mail_cursor text NULL`, `unread_total int NULL`, `cache_purged_at timestamptz NULL`,
  timestamps. Calendar cursors live per calendar on `account_calendars.cursor`.
- UNIQUE `(user_id, provider, address)`: connecting the same address twice merges capabilities
  into one row.
- Rule: at most ten rows per user, enforced in the service and by a check in the API test.
- Transitions: `connected` → `reconnect_needed` (401 or `invalid_grant`) → `connected` (user
  reconnects, credential replaced); pause and resume set and clear `paused_at` from any status
  without changing it; `connected` → `error` (twenty
  consecutive failures) → `connected` (user reconnects or the next manual refresh succeeds);
  any → deleted (disconnect, after revoke at provider; account deletion cascade).

## account_calendars

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `provider_calendar_id text`, `name text`, `is_primary boolean`, `enabled boolean DEFAULT
  false`, `colour text NULL` (provider colour, informational), `cursor text NULL` (Google
  `syncToken`, Graph `deltaLink` or CalDAV `sync-token`/`ctag` for this calendar), timestamps.
- UNIQUE `(account_id, provider_calendar_id)`. The primary calendar is `enabled` on connect.

## cached_events

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `calendar_id REFERENCES account_calendars ON DELETE CASCADE`, `provider_event_id text`
  (occurrence id, so recurring instances are distinct), `title text`, `starts_at timestamptz`,
  `ends_at timestamptz`, `all_day boolean`, `time_zone text NULL`, `location text NULL`,
  `tentative boolean DEFAULT false`, `link text NULL`, `seen_at timestamptz`.
- UNIQUE `(calendar_id, provider_event_id)`, because providers scope event ids to a calendar
  and the same invitation can appear on two calendars of one account; index `(user_id,
  starts_at)`.
- Rows that do not overlap yesterday to today plus seven days (`ends_at < yesterday OR starts_at >
  today + 7`) are deleted on each refresh, and reads use the same overlap test, so an event that
  began before the window but is still running stays (FR-006); rows not seen in a full-window
  fetch are deleted.

## cached_messages

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `provider_message_id text`, `from_name text NULL`, `from_address text` (lowercased), `subject text`
  (empty allowed; UI shows "(no subject)"), `preview text` (at most 200 characters),
  `received_at timestamptz`, `unread boolean`, `link text NULL`, `seen_at timestamptz`.
- UNIQUE `(account_id, provider_message_id)`; index `(user_id, received_at DESC)`.
- After each refresh only the newest fifty rows per account remain. The per-account unread count
  is `count(*) where unread` over these rows, replaced by `connected_accounts.unread_total` when
  the provider reports a larger total (IMAP `SEARCH UNSEEN`), so the badge is not capped at
  fifty.

## Baseline tables touched

- `users`: `time_zone` (Phase 3) drives display. New column `last_active_at timestamptz NULL`
  (same `panels` migration), written by `apps/api/src/middleware/session.ts` at most once per
  five minutes per user. The activity tier (FR-008) and the 30-day idle purge (FR-012) read it
  rather than `sessions.last_seen_at`, because on Stage 2 sessions live in KV and have no SQL row.
- `flags`: rows `panels.today` (the Today page, the Connections settings section and their API
  routes; off means no navigation entry and 404 from `/today` and `/connections*`),
  `panels.google_calendar`, `panels.google_mail`, `panels.microsoft`, `panels.standards`, all
  default off in production, on in local and e2e-ci.
- `audit_log`: entries for connect, reconnect, pause, disconnect, revoke failures, purge.
- `jobs`: names `panels.scheduler`, `panels.refresh`, `panels.purge`.

## Derived payload (not a table)

`GET /today` builds, per user: days (today to today plus six) each with its events in start
order, all-day first; messages newest first across accounts with per-account unread counts;
per-account status, `lastRefreshAt`, `stale` (older than the tier interval) and `reconnectUrl`
when needed. Shapes are in `contracts/api.md`.

## Cascade and isolation guarantees

- Deleting a connected account cascades calendars, events and messages; the service revokes at
  the provider first and records a failure in `audit_log` rather than skipping the delete.
- Deleting a user first runs revoke for every account (best effort, audited), then the existing
  user cascade removes all four tables.
- Every query filters by `user_id`; the ownership matrix test covers every route in
  `contracts/api.md` with two users, including `POST /today/refresh` and every `:id` route.
