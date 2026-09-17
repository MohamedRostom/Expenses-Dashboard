# Research: Dashboard Widgets

Phase 0 of [plan.md](plan.md). Every unknown in the plan's Technical Context is resolved here;
there are no open NEEDS CLARIFICATION items. Sources and licence terms are recorded in
`docs/adr/ADR-0005-weather-source.md`.

## R1. Weather, place search and sunrise: Open-Meteo over `fetch`

- **Decision**: keyless `GET` JSON endpoints. Place search:
  `geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en` returning `name`,
  `admin1`, `country`, `latitude`, `longitude`, `timezone`. Forecast:
  `api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,weather_code
  &daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,daylight_duration
  &timezone=<place tz>&forecast_days=4`, one call per place per hour, serving both the weather
  and the sunrise widget. "Use my current location": Open-Meteo has no reverse-geocoding
  endpoint and the owner ruled out a second source (ADR-0005), so Desk resolves device
  coordinates approximately: (1) the nearest place already in `geocode_cache` or the user's
  `places` within 0.05°, else (2) a forecast call with `timezone=auto` to get the zone and a
  name search for the zone's city, presented as "near <city>" for the user to confirm or
  replace by typing. Coordinates are rounded to two decimals before any request and never
  stored or logged.
- **Rationale**: one forecast call covers both widgets (ADR-0005 quota); the place's IANA zone
  comes from geocoding, which the sunrise widget needs (spec clarification Q4); one source
  keeps the privacy page to a single entry.
- **Alternatives considered**: Nominatim reverse lookup (exact, keyless, but a second third
  party with its own policy and attribution; rejected by the owner); browser-side reverse
  lookup (exposes coordinates from the device; rejected by the spec).

## R2. Rate history: Frankfurter date-range endpoint into `fx_rates`

- **Decision**: extend the existing rates client with `range(from, to, base, quotes)` calling
  `api.frankfurter.app/<from>..<to>?from=<base>&to=<quotes>`; the `widgets.rates_backfill` job
  upserts each returned date into `fx_rates` (`source = 'frankfurter'`), one request per
  currency added. Change maths reads `fx_rates` for the pair over the last 31 published dates;
  the existing daily rate fetch keeps it current afterwards.
- **Rationale**: same table and source the conversions use, so SC-001 (widget rate equals
  expense rate) holds by construction; no history store.
- **Alternatives considered**: a separate `rate_history` table (duplicates `fx_rates`);
  client-side 31 requests (quota and latency).

## R3. Storage shape: one `widgets` table, JSON settings validated per kind

- **Decision**: `widgets(user_id, kind, position, settings jsonb, place_id)` with a zod schema
  per kind in `packages/core/src/widgets/settings.ts` enforcing caps (six currencies, not the
  default currency, one place). `places` is user-owned (name, admin1, country, tz, lat/lon
  rounded to 2 dp). Shared caches `weather_readings` (keyed by rounded lat/lon) and
  `geocode_cache` (keyed by normalised query) hold no user data, mirroring `fx_rates`.
- **Rationale**: five kinds with two or three settings each do not justify five tables
  (Principle VI); JSON with a schema keeps "add a kind" to one file and one component.
- **Alternatives considered**: table per kind; sparse settings columns.

## R4. Refresh, freshness and quota

- **Decision**: `widgets.weather_refresh` runs on the existing minute tick, selects places whose
  reading is older than one hour and which belong to a user with a session seen in the last
  24 hours (the same "active" definition as spec 002), and fetches each once. `GET /widgets`
  returns cached readings with `staleSince` when older than one hour; `POST /widgets/refresh`
  marks the user's places due, rate-limited to one per minute per user. Rates need no
  widget-specific refresh. A 429 or quota error from Open-Meteo sets a deployment-wide
  `weather_paused_until` value (in `flags`) so no further calls are made until it lifts;
  readings show "source limit reached".
- **Rationale**: per-place sharing means calls scale with distinct active places, not users;
  the global pause turns quota exhaustion into a stale state, not a burst of failures.
- **Alternatives considered**: refresh on page open only (breaks the one-hour promise for an
  open tab); per-user refresh (multiplies calls).

## R5. Place search throttle and cache

- **Decision**: client debounces 400 ms and sends at three characters or more; the API applies
  `RateLimiter` key `places.search:<userId>` at ten per minute (429 → "wait a moment"); results
  are cached in `geocode_cache` for 24 hours by normalised query (trimmed, lower-cased,
  single-spaced), so repeated searches across users cost nothing.
- **Rationale**: spec FR-013; worst-case search traffic stays at a few hundred calls a day.
- **Alternatives considered**: a bundled city list with a prefix index (a large asset for
  little gain).

## R6. Widget maths in `packages/core`

- **Decision**: `rate-change.ts` takes a date-ordered list of `{ date, rate: string }` and
  returns previous-day and 30-day deltas and percentages to one decimal using scaled-integer
  arithmetic on the `numeric(20,10)` strings; `spend-pace.ts` and `fixed-costs.ts` take the
  baseline month-summary output (`Money` totals per category, `budget_minor`, kind) and the
  user's zone to compute spend so far, budget sum, percent, days left (calendar days remaining
  in the user's zone including today), daily-to-budget, remaining fixed categories with the
  usual-amount rule (budget, else previous month's amount, else none).
- **Rationale**: property-testable without I/O; money stays integer minor units (Principle III).
- **Alternatives considered**: computing in SQL (harder to property-test; duplicates the month
  summary).

## R7. Strip rendering and performance

- **Decision**: `<WidgetStrip>` is a lazily imported chunk mounted after the host view's data
  has rendered; each widget reserves a fixed-height frame so loaded figures never shift the
  expenses below (FR-001); the store polls `GET /widgets` every five minutes while the tab is
  visible and calls `POST /widgets/refresh` on open when any reading is older than one hour.
  °C/°F conversion is client-side from the Celsius reading, so the cache is unit-free.
- **Rationale**: SC-003 (≤ 100 ms added to the month view); one payload for the whole strip.
- **Alternatives considered**: strip inside the month payload (couples the two and delays the
  expenses data).

## R8. Reorder without a library

- **Decision**: pointer drag using `setPointerCapture` and `pointermove` over the frames, plus
  "move up / move down" in each frame's menu for keyboard users, every move announced through an
  `aria-live="polite"` region; the client sends `PUT /widgets/order` with the full id list after
  a drop or a keyboard move.
- **Rationale**: Principle VI; the keyboard path is required by FR-004 and is simpler than
  making drag itself accessible.
- **Alternatives considered**: a drag-and-drop library (a dependency for one list).

## R9. Testing strategy

- **Decision**: fast-check properties for R6 (spend so far plus remaining budget never differs
  from the month total; usual amount equals budget whenever a budget exists; a rate list of
  fewer than 31 dates yields "since <first date>"); recorded Open-Meteo fixtures (search with
  two homonyms, forecast with sunrise and sunset, 429, empty result) and Frankfurter range
  fixtures (31 days, weekend gap, short history) with fakes validated against them; API suite
  with the ownership matrix for all nine routes, the eight-widget and six-currency caps, the
  search throttle and the quota pause; Playwright ci with `infra/mocks` Open-Meteo for every
  widget state, keyboard reorder and the device-location flow (granted and denied via
  Playwright's geolocation context); Lighthouse on the month view with eight widgets asserting
  the 100 ms delta; e2e-local nightly against real Open-Meteo for one place sampling SC-004.
- **Rationale**: the constitution's pyramid; the real source only outside CI.

## Owner decisions and prerequisites this plan depends on

| Item | Status | Needed by |
|------|--------|-----------|
| ADR-0005 weather source | Done (2026-09-17) | Slice B |
| Baseline Phase 2 month summary and category budgets | Per `docs/ROADMAP.md` | Slices A and D |
| Baseline Phase 4 privacy page (`apps/landing`) | Per roadmap | Slice B privacy text |
| Spec 002 Slice A (Today page) | Per roadmap v2 | Slice E only |
