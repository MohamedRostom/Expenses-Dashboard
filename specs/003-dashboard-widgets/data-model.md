# Data Model: Dashboard Widgets

Extends the baseline schema (`specs/001-phased-product-baseline/data-model.md`) in one migration
named `widgets`. Conventions as before: `id uuid` primary keys, `timestamptz` timestamps,
`user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE` on every user-owned table with an
index starting with `user_id`. Shared caches follow the `fx_rates` pattern: no `user_id`, never
exported, never cascaded.

## widgets (user-owned)

- `id`, `user_id`, `kind text` (`currency` | `weather` | `sunrise` | `spend_pace` |
  `fixed_costs`), `position int NOT NULL`, `settings jsonb NOT NULL DEFAULT '{}'`,
  `place_id uuid NULL REFERENCES places(id) ON DELETE SET NULL`, timestamps.
- UNIQUE `(user_id, position)` DEFERRABLE INITIALLY DEFERRED so a full reorder is one
  transaction. Rule: at most eight rows per user, enforced in the service and asserted in the
  API suite.
- `settings` is validated per kind by `packages/core/src/widgets/settings.ts`:
  - `currency`: `{ currencies: string[] }` — one to six ISO 4217 codes, none equal to the
    user's default, each convertible by the rates source.
  - `currency`, continued: the "not the default" rule is applied only to codes being added or
    edited; stored codes are never rewritten when the user's default changes (research R12).
  - `weather`, `sunrise`: `{}` — the place comes from `place_id`, which MUST be set. A new
    `sunrise` widget without a place copies the `place_id` of the lowest-position `weather`
    widget (research R11).
  - `spend_pace`, `fixed_costs`: `{}`.
- Duplicate = insert a new row copying `kind`, `settings`, `place_id` at the last position.

## places (user-owned)

- `id`, `user_id`, `name text`, `admin1 text NULL`, `country text`, `time_zone text` (IANA),
  `lat numeric(5,2)`, `lon numeric(5,2)` (rounded to two decimals before insert; never more
  precise), `created_at`.
- Immutable after insert. UNIQUE `(user_id, lat, lon)`; choosing a place reuses the row with
  the same rounded coordinates or inserts one. Changing a widget's place repoints that widget
  only, so widgets that shared the old row keep it (research R11).
- A place row is deleted when the last widget referencing it is removed or repointed (service
  rule, checked after every widget delete or place change). Exported with the user's data; device coordinates never touch
  this table.

## weather_readings (shared, not user-owned)

- `lat numeric(5,2)`, `lon numeric(5,2)`, `time_zone text`, `current jsonb`
  (`{ temperatureC, weatherCode, observedAt }`), `daily jsonb` (four entries of
  `{ date, maxC, minC, weatherCode, sunrise, sunset, daylightSeconds }` in the place's zone),
  `fetched_at timestamptz`, `last_active_at timestamptz` (latest time a user with this place
  was active; drives refresh and purge), `error text NULL`.
- PRIMARY KEY `(lat, lon)`. Rows whose `last_active_at` is older than seven days are deleted
  by `widgets.purge`.

## geocode_cache (shared, not user-owned)

- `query text PRIMARY KEY` (normalised: trimmed, lower-cased, single-spaced), `results jsonb`
  (up to five `{ name, admin1, country, lat, lon, timeZone }` with lat/lon already rounded),
  `fetched_at`. Rows older than 24 hours are ignored on read and deleted by `widgets.purge`.

## widget_source_usage (shared, not user-owned; FR-019)

- `day date`, `source text` (`open_meteo.forecast` | `open_meteo.search` | `frankfurter.range`),
  `calls int NOT NULL DEFAULT 0`, `failures int NOT NULL DEFAULT 0`. PRIMARY KEY `(day, source)`.

## widget_source_state (shared, not user-owned; FR-019)

- `source text PRIMARY KEY` (same values as above), `consecutive_failures int NOT NULL DEFAULT
  0` (reset to 0 on a success), `last_success_at timestamptz NULL`, `last_failure_at timestamptz
  NULL`. Never purged (three rows). A source is failing when `consecutive_failures >= 3`.
- No user id, no place, no query text. Rows older than 90 days are deleted by
  `widgets.purge`. Read by `GET /healthz/widgets` (status only) and by the daily
  `widget_source_summary` log line (counts).

## Baseline tables touched

- `users`: `temperature_unit text NOT NULL DEFAULT 'C'` (`C` | `F`), editable through
  `PATCH /me`. Read only: `time_zone` (defines "today" and "this month", research R10) and
  `last_active_at` (spec 002; defines an active user for the weather refresh, research R4).
- `fx_rates`: no schema change; `widgets.rates_backfill` upserts rows for the 31 days before
  the add date for `(base = currency, quote = default_currency)`.
- `flags`: rows `widgets.currency`, `widgets.weather`, `widgets.sunrise`, `widgets.spend_pace`,
  `widgets.fixed_costs` (default off in production, on locally and in e2e-ci) plus a value row
  `widgets.weather_paused_until` (timestamp or null) set on a 429/quota error.
- `audit_log`: entries for widget add, remove, reorder, place chosen, place removed, device
  location used (event only, no coordinates), quota pause.
- `jobs`: names `widgets.weather_refresh`, `widgets.rates_backfill`, `widgets.purge`.

## Derived payload (not a table)

`GET /widgets` returns, per widget in position order, the row plus `figures` computed by
`apps/api/src/services/widget-figures.ts`:

- `currency`: per code `{ code, rate, rateDate, prevChange: { pct, direction } | null,
  monthChange: { pct, direction, since } | null, changesPending? }`; `since` is set only when
  the history does not reach back 30 calendar days; both changes are `null` with `changesPending: true` while the
  history backfill has not landed. A code equal to the current default returns
  `{ code, isDefault: true }` only.
- `weather`: `{ place, temperatureC, condition, icon, todayMaxC, todayMinC, outlook: [3 days],
  observedAt, staleSince?, cause? }`.
- `sunrise`: `{ place, sunrise | null, sunset | null, daylightSeconds, placeTimeZone,
  showZone: boolean, polar?: 'day' | 'night' }`; `polar` is set when the source returns no
  sunrise or sunset for the day (daylight 24 h or 0 h); the client shows "Sun up all day" or
  "Sun down all day".
- `spend_pace` (month window and days left in `users.time_zone`): `{ spentMinor, budgetMinor | null, pct | null, daysLeft, dailyToBudgetMinor |
  null, overBudget }` in the default currency.
- `fixed_costs`: `{ remaining: [{ categoryId, name, usualMinor | null, usualBasis:
  'budget' | 'previous' | 'none' }], totalExpectedMinor, allRecorded }`.
- Every widget carries `state`: `ready` | `empty` | `stale` | `error` | `unavailable` (kind flag
  off) and `asOf`.

Shapes are in `contracts/api.md`.

## Cascade and isolation guarantees

- Deleting a user cascades `widgets` and `places`; shared caches are untouched.
- Every `widgets` and `places` query filters by `user_id`; the ownership matrix covers all nine
  routes in `contracts/api.md` with two users, including `PUT /widgets/order` (a list containing
  another user's id is rejected as `not_found`).
- `GET /me/export` gains `widgets: [{ kind, position, settings, place? }]` with the place's
  name, region, country and rounded coordinates; never cached readings.
