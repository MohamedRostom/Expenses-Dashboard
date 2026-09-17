# Data Model: Mail and Calendar Panels

Extends the baseline schema (`specs/001-phased-product-baseline/data-model.md`) with four tables
in one migration named `panels`. Conventions as before: `id uuid` primary keys, `user_id uuid NOT
NULL REFERENCES users(id) ON DELETE CASCADE` on every table, timestamps in `timestamptz`, an index
starting with `user_id` on every table. No table here references the expense tables (FR-013).

## connected_accounts

- `id`, `user_id`, `provider text` (`google` | `microsoft` | `standards`), `address citext`,
  `label text` (defaults to the address), `colour text`, `capabilities text[]` (`mail`,
  `calendar`, one or both), `granted_scopes text[]`, `credential_enc bytea` (AES-256-GCM via
  `SecretBox`: refresh token, or app password plus host and port for standards),
  `status text` (`connected` | `reconnect_needed` | `paused` | `error`), `paused_at timestamptz
  NULL`, `last_refresh_at timestamptz NULL`, `last_error text NULL`, `consecutive_failures int
  DEFAULT 0`, `next_refresh_at timestamptz NOT NULL`, `mail_cursor text NULL`,
  `calendar_cursor text NULL`, `unread_total int NULL`, `cache_purged_at timestamptz NULL`,
  timestamps.
- UNIQUE `(user_id, provider, address)`: connecting the same address twice merges capabilities
  into one row.
- Rule: at most ten rows per user, enforced in the service and by a check in the API test.
- Transitions: `connected` → `reconnect_needed` (401 or `invalid_grant`) → `connected` (user
  reconnects, credential replaced); `connected` ↔ `paused` (user); `connected` → `error` (twenty
  consecutive failures) → `connected` (user reconnects or the next manual refresh succeeds);
  any → deleted (disconnect, after revoke at provider; account deletion cascade).

## account_calendars

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `provider_calendar_id text`, `name text`, `is_primary boolean`, `enabled boolean DEFAULT
  false`, `colour text NULL` (provider colour, informational), timestamps.
- UNIQUE `(account_id, provider_calendar_id)`. The primary calendar is `enabled` on connect.

## cached_events

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `calendar_id REFERENCES account_calendars ON DELETE CASCADE`, `provider_event_id text`
  (occurrence id, so recurring instances are distinct), `title text`, `starts_at timestamptz`,
  `ends_at timestamptz`, `all_day boolean`, `time_zone text NULL`, `location text NULL`,
  `tentative boolean DEFAULT false`, `link text NULL`, `seen_at timestamptz`.
- UNIQUE `(account_id, provider_event_id)`; index `(user_id, starts_at)`.
- Rows outside yesterday to today plus seven days are deleted on each refresh; rows not seen in a
  full-window fetch are deleted.

## cached_messages

- `id`, `user_id`, `account_id REFERENCES connected_accounts ON DELETE CASCADE`,
  `provider_message_id text`, `from_name text NULL`, `from_address citext`, `subject text`
  (empty allowed; UI shows "(no subject)"), `preview text` (at most 200 characters),
  `received_at timestamptz`, `unread boolean`, `link text NULL`, `seen_at timestamptz`.
- UNIQUE `(account_id, provider_message_id)`; index `(user_id, received_at DESC)`.
- After each refresh only the newest fifty rows per account remain. The per-account unread count
  is `count(*) where unread` over these rows, replaced by `connected_accounts.unread_total` when
  the provider reports a larger total (IMAP `SEARCH UNSEEN`), so the badge is not capped at
  fifty.

## Baseline tables touched

- `users`: no new columns; `time_zone` (Phase 3) drives display; activity tier reads
  `max(sessions.last_seen_at)` per user.
- `flags`: rows `panels.google_calendar`, `panels.google_mail`, `panels.microsoft`,
  `panels.standards`, all default off in production, on in local and e2e-ci.
- `audit_log`: entries for connect, reconnect, pause, disconnect, revoke failures, purge.
- `jobs`: names `panels.scheduler`, `panels.refresh`, `panels.purge`.

## Derived payload (not a table)

`GET /today` builds, per user: days (today to today plus six) each with its events in start
order, all-day first; messages newest first across accounts with per-account unread counts;
per-account status, `lastRefreshAt`, `stale` (older than the tier interval) and `reconnectUrl`
when needed. Shapes are in `contracts/api.md`.

## Cascade and isolation guarantees

- Deleting a connected account cascades calendars, events and messages; the service revokes at
  the provider first and records a failure in `last_error` rather than skipping the delete.
- Deleting a user first runs revoke for every account (best effort, audited), then the existing
  user cascade removes all four tables.
- Every query filters by `user_id`; the ownership matrix test covers every route in
  `contracts/api.md` with two users, including `POST /today/refresh` and every `:id` route.
