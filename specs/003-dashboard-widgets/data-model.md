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
  - `weather`, `sunrise`: `{}` — the place comes from `place_id`, which MUST be set.
  - `spend_pace`, `fixed_costs`: `{}`.
- Duplicate = insert a new row copying `kind`, `settings`, `place_id` at the last position.

## places (user-owned)

- `id`, `user_id`, `name text`, `admin1 text NULL`, `country text`, `time_zone text` (IANA),
  `lat numeric(5,2)`, `lon numeric(5,2)` (rounded to two decimals before insert; never more
  precise), `created_at`.
- A place row is deleted when the last widget referencing it is removed (service rule, checked
  after every widget delete). Exported with the user's data; device coordinates never touch
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

## Baseline tables touched

- `users`: `temperature_unit text NOT NULL DEFAULT 'C'` (`C` | `F`), editable through
  `PATCH /me`.
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

- `currency`: per code `{ code, rate, rateDate, prevChange: { pct, direction }, monthChange:
  { pct, direction, since } }`; `since` is set only when fewer than 31 dates exist.
- `weather`: `{ place, temperatureC, condition, icon, todayMaxC, todayMinC, outlook: [3 days],
  observedAt, staleSince?, cause? }`.
- `sunrise`: `{ place, sunrise, sunset, daylightSeconds, placeTimeZone, showZone: boolean }`.
- `spend_pace`: `{ spentMinor, budgetMinor | null, pct | null, daysLeft, dailyToBudgetMinor |
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
