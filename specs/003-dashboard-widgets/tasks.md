# Tasks: Dashboard Widgets

**Input**: Design documents from `/specs/003-dashboard-widgets/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/sources.md, quickstart.md
**Generated**: 2026-09-17

**Tests**: included and mandatory. The constitution (Principle I) requires every behaviour change to start with a failing test, so each phase lists its tests before its implementation and `/speckit-implement` must run them red first.

**Baseline dependency**: every task assumes the baseline foundations from `specs/001-phased-product-baseline/tasks.md` exist: `createApp(deps)` and `apps/api/test/harness.ts`, `apps/api/test/ownership.test.ts`, `RateLimiter`, `JobRunner` (`apps/api/src/jobs/runner.ts`), the `flags`, `audit_log`, `fx_rates` and `category_budgets` tables, `users.time_zone` and `users.default_currency`, `packages/core/src/month-summary.ts` and `forecast.ts`, the Frankfurter rates client and `FakeRates` (`packages/connectors/src/rates/`), `PanelState.vue`, `packages/ui` components, `tests/e2e/fixtures/index.ts` (`freezeClock`, `axeCheck`), `infra/mocks` (`@desk/mocks`) and `apps/landing/src/pages/privacy.vue`. Slices A, C and D need roadmap Phase 2 (month summary, budgets); Slice B's privacy text needs Phase 4; Slice E needs spec 002 Slice A.

**Organization**: phases follow spec priority (US1 currency, US2 weather, US3 arrange, US4 other widgets). Foundational carries the `widgets` table, the list/add/patch/remove routes and the strip with its empty state, because the currency widget (US1) cannot be added without them and US3's add/remove/settings acceptance rides on the same code (plan Slice A). Reorder and duplicate stay in US3 (Slice C). The Today page strip (Slice E) is a cross-cutting task in the final phase, gated on spec 002.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (currency), US2 (weather), US3 (arrange), US4 (spend pace, fixed costs, sunrise)
- Every task names its file(s); paths are repository-relative

## Path Conventions

Monorepo per plan.md: `apps/api/src`, `apps/api/test`, `apps/web/src`, `packages/{core,contracts,connectors,db,ui}/src`, `infra/mocks/src`, `tests/e2e/tests`, `apps/landing/src`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: environment, flags, connector and mock scaffolding that every slice needs. No new dependency (Principle II, plan Technical Context).

- [ ] T001 Commit the planning set (`specs/003-dashboard-widgets/**`, `docs/adr/ADR-0005-weather-source.md`, edited `CLAUDE.md`) on the current branch so the delivery branch starts from it
- [ ] T002 [P] Extend `.env.example` with `OPEN_METEO_API_BASE` (optional; unset means the client calls `https://api.open-meteo.com` and `https://geocoding-api.open-meteo.com`, set means both search and forecast go to `<base>/v1/...`) with a one-line comment, extend the schema in `apps/api/src/env.ts`, and add a case to `apps/api/test/env.test.ts`
- [ ] T003 [P] Add the flag rows `widgets.currency`, `widgets.weather`, `widgets.sunrise`, `widgets.spend_pace`, `widgets.fixed_costs` (off in production, on in local and e2e-ci) and the value row `widgets.weather_paused_until` (null) to the flags seed in `packages/db/src/seed.ts`, and expose the five boolean flags through `GET /flags` in `apps/api/src/routes/flags.ts`
- [ ] T004 [P] Create `infra/mocks/src/open-meteo.ts` as an empty Hono sub-app mounted at `/open-meteo` in `infra/mocks/src/server.ts`, and pass `OPEN_METEO_API_BASE=http://mocks:4000/open-meteo` to the `api` service in `infra/docker-compose.yml`
- [ ] T005 [P] Create the connector folder `packages/connectors/src/open-meteo/` (`index.ts` exporting the `WeatherSource` interface, `PlaceCandidate`, `Forecast`, `SourcePaused`, `SourceError` from contracts/sources.md; empty `fake.ts`, `wmo.ts`, `fixtures/`) with a `./open-meteo` export in `packages/connectors/package.json`, and `packages/core/src/widgets/index.ts` re-exported from `packages/core/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tables, contracts, settings validation, the widgets service and its five CRUD routes, the figures skeleton with `state`/`asOf`, export and cascade, the store, the strip and frame with every state, and the empty state on the month view. No widget shows figures yet (plan Slice A minus the currency widget).

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests (write first, watch them fail)

- [ ] T006 [P] Write failing unit tests in `packages/core/src/widgets/settings.test.ts`: `currency` accepts one to six ISO codes from a `convertible` set, refuses a seventh, refuses the default currency and refuses an unknown code each with a message naming the code; `weather` and `sunrise` accept `{}` only and require a place id; `spend_pace` and `fixed_costs` accept `{}` only; `WIDGET_LIMIT === 8`, `CURRENCY_CAP === 6`
- [ ] T007 [P] Write failing API tests in `apps/api/test/widgets.test.ts` (foundational subset): `GET /widgets` for a new user returns `{ widgets: [], limit: 8, temperatureUnit: 'C' }`; `GET /widgets/types` lists enabled kinds with `name`, `description`, `needsPlace`, `settingsSchema` and lists a flag-off kind with `enabled: false` only when the user already has one; `POST /widgets` appends at the last position and answers 201; the ninth add answers 409 `limit_reached`; bad settings answer 422 `validation_failed`; `PATCH /widgets/:id` replaces settings; `DELETE /widgets/:id` answers 204 and writes `widget.remove` to `audit_log`; a widget whose kind flag is off comes back with `state: 'unavailable'`; `GET /me/export` contains `widgets: [{ kind, position, settings, place? }]` and no cached readings; extend `apps/api/test/me.test.ts` so `DELETE /me` asserts `widgets` and `places` rows are gone while `weather_readings` and `geocode_cache` rows remain
- [ ] T008 [P] Extend the routes table in `apps/api/test/ownership.test.ts` with all nine routes in contracts/api.md: `PATCH /widgets/:id`, `DELETE /widgets/:id` as user A against user B's id expecting `not_found`; `PUT /widgets/order` with B's id in the list expecting `not_found`; `POST /widgets` with B's `placeId` expecting `not_found`; `GET /widgets` and `GET /widgets/types` asserting none of B's widgets or kinds-in-use appear; `POST /widgets/refresh` asserting only A's places are marked due; `GET /places/search` and `POST /places/resolve` asserting no `places` row is created for B and A's `audit_log` entries name only A
- [ ] T009 [P] Write failing Playwright test `tests/e2e/tests/widgets.spec.ts` (ci, foundational): the month view renders its expenses before the strip appears; with no widgets the strip shows an empty state that explains what widgets are and offers the enabled kinds; "add widget" lists each kind with a one-line description and a preview; a widget with no figures shows a fixed-height loading frame and the expenses below do not move when it resolves; axe on the empty, loading and unavailable states at 360 px and desktop width

### Implementation

- [ ] T010 Extend `packages/db/src/schema.ts` with `widgets`, `places`, `weather_readings`, `geocode_cache` exactly as data-model.md (columns, `user_id` cascade with an index starting on `user_id`, deferrable `UNIQUE (user_id, position)`, `places` unique per user on rounded `(lat, lon)`, `weather_readings` primary key `(lat, lon)`, `geocode_cache` primary key `query`) and `users.temperature_unit text NOT NULL DEFAULT 'C'`; run `pnpm db:generate --name widgets`
- [ ] T011 [P] Add zod schemas in `packages/contracts/src/widgets.ts` (`WidgetKind`, `WidgetState`, `Widget`, `WidgetCreate` with `kind`, `settings?`, `placeId?`, `place?`, `duplicateOf?`, `WidgetPatch`, `OrderBody`, `WidgetsResponse`, `WidgetTypesResponse`, `RefreshResponse`, and the per-kind `figures` shapes from data-model.md §Derived payload including `attribution`) and `packages/contracts/src/places.ts` (`PlaceCandidate`, `SearchQuery` with `q` 3–80 chars, `ResolveBody`, `CandidatesResponse`); add error codes `limit_reached`, `source_unreachable`, `source_limit_reached`, `place_not_found`, `source_paused` to `packages/contracts/src/errors.ts`; add `temperatureUnit: 'C' | 'F'` to the `PATCH /me` and `GET /me` schemas in `packages/contracts/src/me.ts`; export from `packages/contracts/src/index.ts`
- [ ] T012 [P] Implement `packages/core/src/widgets/settings.ts`: `WIDGET_KINDS`, `WIDGET_LIMIT = 8`, `CURRENCY_CAP = 6`, `settingsSchemaFor(kind, { defaultCurrency, convertible })` returning the zod schema per kind, and `validateSettings(kind, settings, ctx)` returning issues that name the offending code; export from `packages/core/src/widgets/index.ts`
- [ ] T013 Implement `apps/api/src/services/widgets.ts`: `list(user)` in position order, `typesFor(user, flags)`, `create(user, body)` (limit check → `limit_reached`, `validateSettings` with the user's default currency and the rates provider's convertible set → `validation_failed`, `place` → `ensurePlace` create-or-reuse on rounded `(lat, lon)`, `placeId` resolved with `user_id = current` → `not_found`, next position, audit `widget.add`), `patch(user, id, body)` (same validation; a changed place drops the old row when unreferenced), `remove(user, id)` (delete, then delete the place if no widget of the user references it, audit `widget.remove` and `place.removed`)
- [ ] T014 Implement `apps/api/src/services/widget-figures.ts` skeleton: `figuresFor(user, widgets, flags, now)` returning `{ state, asOf, figures }` per widget, `state: 'unavailable'` when the kind's flag is off (keeping whatever figures the kind builder returns), and a per-kind builder table (`currency`, `weather`, `sunrise`, `spend_pace`, `fixed_costs`) whose entries return `{ state: 'empty' }` until US1, US2 and US4 fill them
- [ ] T015 Implement `apps/api/src/routes/widgets.ts` for `GET /widgets` (list + `figuresFor` + `limit` + `temperatureUnit`), `GET /widgets/types`, `POST /widgets`, `PATCH /widgets/:id`, `DELETE /widgets/:id` with the contracts schemas, and mount in `apps/api/src/app.ts`
- [ ] T016 [P] Extend `apps/api/src/routes/me.ts`: `PATCH /me` accepts `temperatureUnit`, `GET /me` returns it, and `GET /me/export` gains `widgets` (kind, position, settings and the place's name, admin1, country, rounded lat/lon) via `apps/api/src/services/widgets.ts` `exportFor(user)`
- [ ] T017 [P] Build `apps/web/src/stores/widgets.ts` (Pinia: `load()` → `GET /widgets`, `types()`, `add(body)`, `patch(id, body)`, `remove(id)`, poll `GET /widgets` every five minutes while the tab is visible, `offline` derived from `navigator.onLine` and the last fetch failure so the offline state is decided on the device and never taken from a server error) and `apps/web/src/api/widgets.ts` typed calls; the month store must not import it
- [ ] T018 [P] Build `apps/web/src/components/widgets/WidgetFrame.vue` (fixed-height frame with title, "as of" time computed from the server `asOf`, `PanelState.vue` for loading, empty, stale, error and unavailable with copy branching on `cause`: `source_unreachable`, `source_limit_reached`, `place_not_found`, `rate_unavailable`, `offline`; last figures kept visible under the stale and error banners; a menu with "settings" and "remove"), `apps/web/src/components/widgets/WidgetStrip.vue` (ordered frames from the store, a kind switch rendering a placeholder per kind until US1/US2/US4 supply components, "add widget" button disabled with the limit shown at eight, empty state offering the enabled kinds), `apps/web/src/components/widgets/AddWidgetSheet.vue` (catalogue from `types()` with description and preview; adding places the widget last) and `apps/web/src/components/widgets/WidgetSettingsSheet.vue` (shell with a per-kind slot; only that widget's options; changes apply immediately through `patch`)
- [ ] T019 Mount `<WidgetStrip>` in `apps/web/src/views/MonthView.vue` as a `defineAsyncComponent` chunk rendered only after the month data has resolved, above the tiles, with the strip's attribution line slot; confirm the chunk is absent from the initial bundle in `apps/web/vite.config.ts` output

**Checkpoint**: widgets can be listed, added, edited and removed; the strip shows empty, loading and unavailable states on the month view; no kind shows figures. `pnpm test:unit`, `pnpm test:api`, `pnpm worker:build` and the foundational cases of `tests/e2e/tests/widgets.spec.ts` green; ownership matrix green for all nine routes (the four routes not yet implemented answer `not_found`/404 and are marked pending in the table until US2 and US3 land).

---

## Phase 3: User Story 1 - Watch the currencies I care about (Priority: P1) 🎯 MVP

**Goal**: a currency widget showing, per selected currency, today's published rate to the default currency, its date, and the previous-day and thirty-day changes, backfilled from Frankfurter's range endpoint into `fx_rates` so the widget rate is by construction the expense rate (plan Slice A).

**Independent Test**: set the default currency to GBP, add a currency widget with EUR and USD, enter an expense of 10 EUR dated today, and confirm the rate the widget shows for EUR equals the rate recorded on that expense; open the app on a weekend (frozen clock) and confirm the widget names the Friday the rate was published.

### Tests (write first, watch them fail)

- [ ] T020 [P] [US1] Write failing property tests with fast-check in `packages/core/src/widgets/rate-change.test.ts`: from a date-ordered list of `{ date, rate: string }` the previous change compares the last two published dates and the month change compares the last date with the earliest date at or after `last - 30 days`; direction is `up`, `down` or `flat`; percentages are one-decimal strings computed with scaled integers (no `parseFloat` anywhere, asserted by a rate like `"1.1234567891"`); fewer than 31 dates yields `since: <first date>`; one date yields both changes `null`; an empty list throws
- [ ] T021 [P] [US1] Record fixtures `packages/connectors/src/rates/fixtures/range-eur-gbp-31d.json` (31 calendar days with weekend gaps), `range-short.json` (12 published dates) and `range-unsupported.json`, and write the failing contract test `packages/connectors/src/rates/range.test.ts` asserting the real `FrankfurterRates.range` over a fetch stub and `FakeRates.range` return identical `{ date, rates }[]` with rates as decimal strings, weekend dates absent, and `unsupported` for the unknown code
- [ ] T022 [P] [US1] Extend `apps/api/test/widgets.test.ts` (currency): `POST /widgets` with `{ kind: 'currency', settings: { currencies: ['EUR'] } }` enqueues `widgets.rates_backfill` with the pair `(EUR, GBP)` and running the job against `FakeRates` upserts the published dates of the 31-day fixture into `fx_rates` with `source = 'frankfurter'`; a seventh currency, the default currency and an unsupported code answer 422 naming the code; `GET /widgets` figures carry `rate`, `rateDate`, `prevChange` and `monthChange`, and `monthChange.since` when the fixture is short; with the clock frozen on a Saturday `rateDate` is the Friday; the widget's `rate` and `rateDate` equal `rate_to_default` and `rate_date` on an expense created the same day in EUR (SC-001); `PATCH /me` to a new default currency re-bases every figure on the next `GET /widgets`; a pair with no `fx_rates` row answers `state: 'error'`, `cause: 'rate_unavailable'`; the rate date older than the source's latest published date answers `state: 'stale'`
- [ ] T023 [P] [US1] Extend `tests/e2e/tests/widgets.spec.ts` (ci, currency): add a currency widget with EUR from the add sheet; rate, date and both changes with direction are visible within one second of the strip appearing; the picker refuses the default currency and a seventh code with a message; with `freezeClock` on a Saturday the widget names the Friday; axe on the ready, stale and error states at 360 px and desktop

### Implementation

- [ ] T024 [P] [US1] Implement `packages/core/src/widgets/rate-change.ts` (`rateChanges(history: { date, rate: string }[], now)` → `{ prevChange, monthChange }` per T020 using the baseline scaled-integer helpers in `packages/core/src/money/`) and export from `packages/core/src/widgets/index.ts`
- [ ] T025 [P] [US1] Add `range(from, to, base, quotes)` to `packages/connectors/src/rates/frankfurter.ts` calling `api.frankfurter.app/<from>..<to>?from=<base>&to=<quotes>` and returning `{ date, rates }[]` as decimal strings (never parsed to numbers), `unsupported` on the source's unknown-currency response, and `range` on `packages/connectors/src/rates/fake.ts` seeded from `fixtures/range-*.json`; extend the `RatesProvider` interface in `packages/connectors/src/rates/index.ts`
- [ ] T026 [US1] Implement `apps/api/src/jobs/widgets-rates-backfill.ts` (payload `{ base, quote }`; calls `range(today - 31 days, today, base, [quote])` and upserts each returned date into `fx_rates`; one job per new pair, deduped by key `widgets.rates_backfill:<base>:<quote>`) and register it in `apps/api/src/jobs/index.ts`; enqueue it from `create` and `patch` in `apps/api/src/services/widgets.ts` for every code not already present in `fx_rates` for the last 31 days
- [ ] T027 [US1] Fill the `currency` builder in `apps/api/src/services/widget-figures.ts`: for each code read the last 31 published `fx_rates` rows for `(code, default_currency)`, call `rateChanges`, set `rate` and `rateDate` from the newest row (the same lookup `apps/api/src/services/rates.ts` uses for an expense dated today), `state: 'stale'` when `rateDate` is older than the provider's latest published date, `state: 'error', cause: 'rate_unavailable'` when no row exists, `asOf` = newest `rateDate`
- [ ] T028 [US1] Build `apps/web/src/components/widgets/CurrencyWidget.vue` (one row per code in IBM Plex Mono `tabular-nums`: rate, date, previous and thirty-day change with direction glyph and percentage; "since <date>" label when `since` is set) and the currency section of `WidgetSettingsSheet.vue` (multi-select from the convertible list at `GET /rates` currencies, default currency disabled with the reason, cap at six with the message and an offer to add a second currency widget); wire the kind into the `WidgetStrip.vue` switch

**Checkpoint**: US1 independent test passes in e2e-ci; SC-001 asserted in the API suite; `fx_rates` is the only rate store.

---

## Phase 4: User Story 2 - See the weather where I am (Priority: P1)

**Goal**: a weather widget for one user-chosen place fed by Open-Meteo (ADR-0005), cached once per rounded place on the server and refreshed hourly for active places; typed place search with throttle and cache; an explicit "use my current location" button that never stores coordinates; °C/°F as a user preference; quota exhaustion shown as a stale state (plan Slice B).

**Independent Test**: add a weather widget for "Manchester, UK", confirm a temperature and condition appear within five seconds with an "as of" time less than an hour old, switch the unit to °F and confirm the same reading converts correctly, then disconnect from the network and confirm the last reading stays visible marked as stale.

### Tests (write first, watch them fail)

- [ ] T029 [P] [US2] Record fixtures under `packages/connectors/src/open-meteo/fixtures/` (`search-manchester.json` with two homonyms in different countries, `search-empty.json`, `forecast-manchester.json` with four daily entries including sunrise, sunset and daylight and a night-time `observedAt`, `forecast-429.json`, `forecast-5xx.txt`) and write the failing contract test `packages/connectors/src/open-meteo/client.test.ts` asserting identical `PlaceCandidate[]` (lat/lon rounded to two decimals) and `Forecast` from the real client over a fetch stub and from `OpenMeteoFake`, `SourcePaused { retryAfterMs }` on the 429 fixture, `SourceError` on the 5xx fixture and on a network failure, and that the real client sends no header beyond `Accept`; write `packages/connectors/src/open-meteo/wmo.test.ts` asserting every WMO code 0–99 maps to a condition word and an icon name
- [ ] T030 [P] [US2] Write failing unit tests in `packages/core/src/widgets/place.test.ts`: `roundCoord` rounds to two decimals half-up and never returns more precision; `cacheKey(lat, lon)` is equal for coordinates within the same 0.01° cell; `normaliseQuery` trims, lower-cases and collapses whitespace; `nearest(candidates, lat, lon, 0.05)` returns the closest within the radius or `null`
- [ ] T031 [P] [US2] Write failing API tests in `apps/api/test/places.test.ts`: `GET /places/search?q=Ma` answers 422; `q=Manch` returns both Manchester homonyms with `admin1` and `country`; the eleventh search by one user within a minute answers 429 `rate_limited`; the same query by a second user is served from `geocode_cache` (fake call count unchanged); a cache row older than 24 hours is ignored and refetched; `source_paused` 503 while `widgets.weather_paused_until` is in the future; `POST /places/resolve` with device coordinates returns the nearest known place within 0.05° when one exists in `geocode_cache` or the user's `places`, else `approximate: true` with the zone city from the fake's `timezone=auto` forecast, and in both cases leaves no `places` row and an `audit_log` entry `place.device_location_used` without coordinates
- [ ] T032 [P] [US2] Write failing API tests in `apps/api/test/widgets-weather.test.ts`: `POST /widgets` with `kind: 'weather'` and a `place` creates one `places` row and reuses it on a second widget with the same rounded coordinates; two users with the same rounded place share one `weather_readings` row; `widgets.weather_refresh` fetches only places whose reading is older than one hour and whose `last_active_at` is within 24 hours (fake call count); a 429 from the fake sets `widgets.weather_paused_until` and later readings answer `state: 'stale', cause: 'source_limit_reached'`; a 5xx sets `error` on the row and answers `cause: 'source_unreachable'` with the last figures kept; `GET /widgets` answers `state: 'stale'` with `staleSince` when the reading is older than one hour; `POST /widgets/refresh` marks the caller's places due, answers 202 `{ queued }` and 429 on a second call within a minute; `widgets.purge` deletes readings with `last_active_at` older than seven days and `geocode_cache` rows older than 24 hours; `DELETE /widgets/:id` removes the place when it was the last reference and keeps it when a sunrise widget still references it; `temperatureUnit` round-trips through `PATCH /me` and `GET /widgets`; weather figures carry `attribution`
- [ ] T033 [P] [US2] Extend `tests/e2e/tests/widgets.spec.ts` (ci, weather): typing "Ma" sends no search, "Manch" after a pause lists Manchester, UK and Manchester, NH with region and country; choosing one shows temperature, condition, icon, high and low, a three-day outlook and the reading time within five seconds; switching to °F converts every figure and persists across reload; the mock's `pauseSource` control makes the widget stale with "source limit reached" and search say "try again later"; with the page offline (Playwright `context.setOffline(true)`) the last reading stays visible marked "as of" with the offline copy; the "use my current location" button states before the tap that it asks the device once; with Playwright geolocation granted a "near <city>" candidate is offered for confirmation and only the confirmed place appears in Settings; with permission denied the typed search still works and no error blocks the widget; removing the widget removes the place from Settings and from `GET /me/export`; axe on every weather state at 360 px and desktop
- [ ] T034 [P] [US2] Write the e2e-local spec `tests/e2e/tests/widgets.local.spec.ts` tagged `@local` (nightly on `desk-local`): one real place through Open-Meteo, reading appears with an "as of" time under one hour, and a sample loop asserting the age stays under one hour across the run (SC-004 sampling)

### Implementation

- [ ] T035 [P] [US2] Implement `packages/connectors/src/open-meteo/wmo.ts` (Desk-owned table for codes 0–99 → `{ condition, icon }` with the icon names from `packages/ui`)
- [ ] T036 [P] [US2] Implement `packages/connectors/src/open-meteo/client.ts` (`search(query)` → `geocoding-api.open-meteo.com/v1/search?name=&count=5&language=en` mapping `latitude`/`longitude` rounded to two decimals and `timezone`; `forecast(lat, lon, timeZone)` → `api.open-meteo.com/v1/forecast` with the research R1 parameters and `forecast_days=4`, honouring `OPEN_METEO_API_BASE`; 429 or quota body → `SourcePaused`, network or 5xx → `SourceError`; `Accept: application/json` only) and `packages/connectors/src/open-meteo/fake.ts` (`OpenMeteoFake` replaying the fixtures with `setTemperature(lat, lon, c)`, `pauseSource(ms)`, `addPlace(candidate)` and a call counter)
- [ ] T037 [P] [US2] Implement `packages/core/src/widgets/place.ts` (`roundCoord`, `cacheKey`, `normaliseQuery`, `nearest`) and export from `packages/core/src/widgets/index.ts`
- [ ] T038 [US2] Implement `apps/api/src/services/places.ts`: `search(user, q)` (normalise, serve from `geocode_cache` when fresher than 24 hours, `RateLimiter` key `places.search:<userId>` at ten per minute, `source_paused` while `widgets.weather_paused_until` is in the future, cache the result, map `SourcePaused` to `source_paused`), `resolve(user, lat, lon)` (round on receipt, `nearest` over `geocode_cache` results and the user's `places` within 0.05°, else `forecast(lat, lon, 'auto')` for the zone and `search(zoneCity)` with `approximate: true`, audit `place.device_location_used` with no coordinates, nothing persisted), and `ensurePlace(user, candidate)` used by `apps/api/src/services/widgets.ts`
- [ ] T039 [US2] Implement `apps/api/src/routes/places.ts` for `GET /places/search` and `POST /places/resolve` and mount in `apps/api/src/app.ts`
- [ ] T040 [US2] Implement `apps/api/src/jobs/widgets-weather-refresh.ts` (on the minute tick: select `weather_readings` older than one hour or missing for places referenced by widgets of users with a session seen in the last 24 hours, skip entirely while `widgets.weather_paused_until` is in the future, call `forecast` once per rounded place, upsert `current`, `daily`, `fetched_at`, clear `error`; on `SourcePaused` set `widgets.weather_paused_until = now + retryAfterMs` (or the next UTC day), audit `weather.quota_pause`; on `SourceError` set `error` and keep the old figures), `apps/api/src/jobs/widgets-purge.ts` (daily: delete `weather_readings` with `last_active_at` older than seven days and `geocode_cache` older than 24 hours) and register both in `apps/api/src/jobs/index.ts`; add `POST /widgets/refresh` to `apps/api/src/routes/widgets.ts` via `markDue(user)` in `apps/api/src/services/widgets.ts` with `RateLimiter` key `widgets.refresh:<userId>` at one per minute
- [ ] T041 [US2] Fill the `weather` builder in `apps/api/src/services/widget-figures.ts`: read `weather_readings` by the place's rounded `(lat, lon)`, bump `last_active_at`, map `weatherCode` through `wmo.ts`, build `todayMaxC`, `todayMinC` and the three-day `outlook`, `asOf = current.observedAt`, `state: 'stale'` with `staleSince` when `fetched_at` is older than one hour, `cause: 'source_limit_reached'` while paused, `cause: 'source_unreachable'` when the row carries `error`, `state: 'error', cause: 'place_not_found'` when the widget has no place, and `attribution: "Weather data by Open-Meteo.com"`
- [ ] T042 [P] [US2] Implement the mock server `infra/mocks/src/open-meteo.ts` on top of `OpenMeteoFake` (search and forecast routes under `/v1/`, control routes `POST /__control/open-meteo/temperature`, `/pause`, `/place`, `GET /__control/open-meteo/calls`) and add `mockOpenMeteo()` helpers to `tests/e2e/fixtures/index.ts`
- [ ] T043 [P] [US2] Build `apps/web/src/components/widgets/PlacePicker.vue`: typed search input debounced 400 ms sending only at three or more characters, candidates listed as "name, admin1, country", 429 → "wait a moment", 503 → "try again later", empty → "place not found, keeping <previous>"; a "use my current location" button whose label says it will ask the device once, calling `navigator.geolocation.getCurrentPosition` only on tap, posting to `POST /places/resolve`, showing the returned candidate as "near <city>" for confirmation or replacement by typing, and on denial or failure returning to the search with no blocking error; emits only the confirmed candidate
- [ ] T044 [US2] Build `apps/web/src/components/widgets/WeatherWidget.vue` (temperature, condition word and icon, today's high and low, three-day outlook, reading time, attribution line; °C→°F conversion client-side from the Celsius figures), the weather section of `WidgetSettingsSheet.vue` (place via `PlacePicker.vue`, temperature unit toggle saved through `PATCH /me` and applied to every weather widget), a "Widgets" section in `apps/web/src/views/SettingsView.vue` listing the places in use with the unit preference, and wire the kind into the `WidgetStrip.vue` switch and `apps/web/src/stores/widgets.ts` (`refreshIfStale()` calling `POST /widgets/refresh` on open when any reading is older than one hour)
- [ ] T045 [P] [US2] Add the Open-Meteo section to the privacy text in `packages/contracts/src/privacy-text.ts` (the single source, the place's coarse coordinates as the only thing sent, device coordinates from "use my current location" sent once, rounded, never stored, the resolved place approximate and always confirmed, CC-BY attribution per ADR-0005) and render it in `apps/landing/src/pages/privacy.vue`; add a Playwright snapshot of the section to `tests/e2e/tests/landing.spec.ts` (FR-014)

**Checkpoint**: US2 independent test passes against the mock in e2e-ci and against real Open-Meteo nightly; no request ever carries user data or unrounded coordinates.

---

## Phase 5: User Story 3 - Arrange my dashboard (Priority: P2)

**Goal**: reorder with a pointer or the keyboard, announced to assistive technology, saved as one full list; duplicate a widget; the arrangement identical on every device (plan Slice C). Add, remove, settings and the eight-widget limit already work from Phase 2.

**Independent Test**: on a laptop add three widgets and move the weather widget first; sign in on a phone and confirm the same three widgets appear in the same order; remove one on the phone and confirm it is gone on the laptop after reload.

### Tests (write first, watch them fail)

- [ ] T046 [P] [US3] Extend `apps/api/test/widgets.test.ts` (arrange): `PUT /widgets/order` with the caller's ids in a new order persists positions in one transaction and returns the reordered list; a foreign id answers `not_found`; a missing or repeated id answers 422; two overlapping saves end with the last one's order; `POST /widgets` with `duplicateOf` copies `kind`, `settings` and `place_id` at the last position and counts toward the limit; the audit log gains `widget.reorder` and `widget.add` with `duplicateOf`
- [ ] T047 [P] [US3] Extend `tests/e2e/tests/widgets.spec.ts` (ci, arrange): dragging a frame with the pointer reorders and the order survives reload; "move up" from the frame menu by keyboard alone moves the widget and the `aria-live` region text contains the widget name and its new position; "duplicate" appends a copy with the same settings; the settings menu of a currency widget shows only currencies and of a weather widget only place and unit; at eight widgets the add control is disabled and shows the limit; on a phone viewport after sign-in the same widgets appear in the same order and stack in one column with no horizontal scroll at 360 px; a second tab sees the new order after reload

### Implementation

- [ ] T048 [US3] Add `reorder(user, ids)` to `apps/api/src/services/widgets.ts` (load the user's ids, reject a set difference as 422 and a foreign id as `not_found`, update positions inside one transaction relying on the deferred unique, audit `widget.reorder`) and `duplicateOf` handling in `create`; add `PUT /widgets/order` to `apps/api/src/routes/widgets.ts`
- [ ] T049 [US3] Implement reorder in `apps/web/src/components/widgets/WidgetStrip.vue` and `WidgetFrame.vue`: pointer drag with `setPointerCapture` and `pointermove` over the frames (no library), "move up", "move down" and "duplicate" items in the frame menu, an `aria-live="polite"` region announcing "<name> moved to position N of M", and `reorder(ids)` plus `duplicate(id)` in `apps/web/src/stores/widgets.ts` sending `PUT /widgets/order` with the full id list after a drop or a keyboard move

**Checkpoint**: US3 independent test passes; reorder works by keyboard alone with a screen reader (SC-005 reorder clause).

---

## Phase 6: User Story 4 - Other helpful widgets (Priority: P3)

**Goal**: spend pace and upcoming fixed costs computed from the user's own expense data with no external request, and sunrise and sunset from the weather widget's cached reading and place (plan Slice D).

**Independent Test**: in a test account seeded with a month of expenses, a budget, and Rent and Internet as fixed categories with Rent already recorded, add all three widgets and confirm spend pace matches the month view's total and budget, upcoming fixed costs lists Internet only with its usual amount, and sunrise and sunset shows today's times for the weather widget's place; confirm the first two made no external request.

### Tests (write first, watch them fail)

- [ ] T050 [P] [US4] Write failing property tests with fast-check in `packages/core/src/widgets/spend-pace.test.ts` over generated month summaries: `spentMinor` equals the month summary total; `budgetMinor` is the sum of category budgets (categories without a budget add to spend only) or `null` when none is set; `pct` is `null` without a budget; `daysLeft` counts calendar days remaining in the user's zone including today; `dailyToBudgetMinor * daysLeft + spentMinor` never exceeds `budgetMinor` by more than `daysLeft - 1` minor units and is `null` when over budget; the first day of the month with no expenses yields zero spent, the full budget and no division error; `overBudget` is true exactly when spent exceeds budget; all money stays integer minor units
- [ ] T051 [P] [US4] Write failing property tests with fast-check in `packages/core/src/widgets/fixed-costs.test.ts`: every fixed-kind category with no expense this month is listed and none with one; `usualMinor` equals the category budget whenever set (`usualBasis: 'budget'`, matching `packages/core/src/forecast.ts`), else the previous month's amount (`'previous'`), else `null` (`'none'`); `totalExpectedMinor` sums the known usual amounts; `allRecorded` is true with an empty list and carries the recorded total
- [ ] T052 [P] [US4] Write failing API tests in `apps/api/test/widgets-expense.test.ts`: with a seeded month (category budgets, Rent recorded, Internet not) the spend pace figures equal `/summary/month` tiles; with no budgets `state: 'empty'`; fixed costs lists Internet only with `usualBasis`; with every fixed category recorded `allRecorded: true`; a fixed category with no history has `usualMinor: null`; adding an expense changes both widgets on the next `GET /widgets`; the fake Open-Meteo call count is unchanged by both; a sunrise widget added while a weather widget exists takes its `place_id` without a `place` body and reports `showZone` only when the place's zone differs from `users.time_zone`; a sunrise widget without a weather widget requires a place; removing the weather widget keeps the place while the sunrise widget references it
- [ ] T053 [P] [US4] Extend `tests/e2e/tests/widgets.spec.ts` (ci, other widgets): all three widgets render from the seeded month; spend pace shows spent, budget, percentage, days left and daily amount equal to the month view's tiles and switches to the critical colour when a large expense is added; with no budget the widget offers to set one; fixed costs lists Internet with "about" or the budget figure; sunrise shows today's sunrise, sunset and day length for the weather place with the zone shown only when it differs; the mock call counter is unchanged after loading the two expense widgets; axe on every state at 360 px and desktop

### Implementation

- [ ] T054 [P] [US4] Implement `packages/core/src/widgets/spend-pace.ts` (`spendPace(summary, budgets, timeZone, now)` → `{ spentMinor, budgetMinor, pct, daysLeft, dailyToBudgetMinor, overBudget }`) and export from `packages/core/src/widgets/index.ts`
- [ ] T055 [P] [US4] Implement `packages/core/src/widgets/fixed-costs.ts` (`fixedCosts(categories, thisMonth, previousMonth, budgets)` → `{ remaining, totalExpectedMinor, allRecorded }` reusing the usual-amount rule from `packages/core/src/forecast.ts`) and export from `packages/core/src/widgets/index.ts`
- [ ] T056 [US4] Fill the `spend_pace`, `fixed_costs` and `sunrise` builders in `apps/api/src/services/widget-figures.ts`: the first two call the month-summary service used by `/summary/month` for the current month in the user's zone and the previous month, `state: 'empty'` for spend pace without budgets and for fixed costs without fixed categories, `asOf = now`; sunrise reads `weather_readings.daily[0]` for the place (`sunrise`, `sunset`, `daylightSeconds`, `placeTimeZone`, `showZone = placeTimeZone !== user.time_zone`, the same stale and cause rules as weather, `attribution`); `create` in `apps/api/src/services/widgets.ts` defaults a sunrise widget's `place_id` to the user's weather widget's place when no place is given
- [ ] T057 [P] [US4] Build `apps/web/src/components/widgets/SpendPaceWidget.vue` (spent, budget, percentage, days left, daily-to-budget in IBM Plex Mono; critical status colour when over budget, never a chart-series colour; empty state linking to `/categories` to set a budget), `apps/web/src/components/widgets/FixedCostsWidget.vue` (remaining categories with usual amount marked "about" for `'previous'` and "no usual amount yet" for `'none'`, total expected, "all fixed costs are in" with the total) and `apps/web/src/components/widgets/SunriseWidget.vue` (sunrise, sunset, day length in the place's local time, zone only when `showZone`, attribution; settings section using `PlacePicker.vue` when no weather widget exists), and wire the three kinds into the `WidgetStrip.vue` switch and `AddWidgetSheet.vue` previews

**Checkpoint**: US4 independent test passes; the two expense widgets are asserted to make no external request; sunrise shares the weather reading and place.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: performance and accessibility gates, isolation at the browser level, the Today page surface, operator runbook and docs.

- [ ] T058 [P] Add the SC-003 checks: `apps/api/test/widgets-load.test.ts` seeding one user with eight widgets (two currency at six codes, weather, sunrise, spend pace, fixed costs, two more currency) and asserting `GET /widgets` under 150 ms server-side; extend `tests/e2e/lighthouserc.json` and `tests/e2e/tests/widgets.spec.ts` with a Lighthouse run on `/` with no widgets and with eight, asserting the load-time delta ≤ 100 ms, performance ≥ 90 and accessibility ≥ 95 on `/` and `/settings`, and cached figures visible within one second on the throttled mobile profile
- [ ] T059 [P] Add `tests/e2e/tests/isolation-widgets.spec.ts` (ci): two users each with a weather widget on the same rounded place and different currency widgets; user B never sees user A's widgets, places or settings on `/`, `/settings` or in `GET /me/export`, and both see the same reading time (SC-006, FR-006)
- [ ] T060 [P] Mount `<WidgetStrip>` in `apps/web/src/views/TodayView.vue` after the Today data resolves, sharing `apps/web/src/stores/widgets.ts`, and extend `tests/e2e/tests/widgets.spec.ts` (ci) so the same arrangement appears on `/today` and `/` and a reorder on one is visible on the other after reload (plan Slice E; blocked until spec 002 Slice A exists, mark the case `test.skip` with the reason until then)
- [ ] T061 [P] Write `docs/runbooks/widgets-weather-quota.md` (how `widgets.weather_paused_until` is set, how to read the `weather.quota_pause` audit entries, how to lift the pause with `pnpm flags set`, how to switch a kind off with the `widgets.*` flags, what users see meanwhile) and add the Open-Meteo attribution sentence to `README.md`
- [ ] T062 [P] Add a `CHANGELOG.md` entry per slice, add the five slices with their flag gates to `docs/ROADMAP.md`, update the "Current state" section of `CLAUDE.md`, and file a `needs-rostom` note in `docs/ROADMAP.md` for the SC-007 check (three people outside the project add a weather widget unaided and describe what Desk stores)
- [ ] T063 Run quickstart.md end to end on the compose stack (`pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build && pnpm test:e2e -- --project=ci`) and confirm coverage on `packages/core` and `apps/api` is at or above 85 % lines, `worker-build` is green with no new dependency, and every widget state passes axe at 360 px and desktop with eight widgets (SC-005)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts once roadmap Phase 2 (month summary, budgets) is merged; T002–T005 in parallel after T001
- **Foundational (Phase 2)**: depends on Phase 1; blocks every story. T006–T009 (tests) in parallel first; T010 before T013–T016; T011 and T012 in parallel with T010; T013 → T014 → T015; T016 after T013; T017 and T018 in parallel after T011; T019 after T018
- **US1 (Phase 3)**: after Phase 2. Tests T020–T023 in parallel; T024 and T025 in parallel; T026 after T025; T027 after T024 and T026; T028 after T027
- **US2 (Phase 4)**: after Phase 2; independent of US1. Tests T029–T034 in parallel; T035, T036, T037, T042 in parallel; T038 after T036 and T037; T039 after T038; T040 after T036; T041 after T035 and T040; T043 in parallel with T038; T044 after T041 and T043; T045 in parallel with everything (needs the baseline privacy page)
- **US3 (Phase 5)**: after Phase 2; richer with US1 or US2 widgets present but its tests can use currency widgets validated by Phase 2 alone. T046 and T047 in parallel; T048 → T049
- **US4 (Phase 6)**: after Phase 2; the sunrise widget needs US2's `weather_readings`, `PlacePicker.vue` and the weather builder (T036, T040, T041, T043). T050–T053 in parallel; T054 and T055 in parallel; T056 after T054, T055 and T041; T057 after T056
- **Polish (Phase 7)**: after every story wanted for the release; T058–T062 in parallel; T060 additionally waits for spec 002 Slice A; T063 last

### User Story Dependencies

- **US1 (P1)**: needs only Phase 2 → MVP
- **US2 (P1)**: needs only Phase 2; the privacy text (T045) needs the baseline privacy page from roadmap Phase 4
- **US3 (P2)**: needs only Phase 2
- **US4 (P3)**: spend pace and fixed costs need only Phase 2; sunrise needs US2

### Within Each User Story

- Tests are written and fail before implementation; the PR shows the test before the change
- Fixtures and fakes before real clients; real client and fake pass the same contract test
- Connector → core → job → service → route → store → component
- Every new route enters `apps/api/test/ownership.test.ts` in the same PR (all nine are added in T008; the routes land in T015, T039, T040 and T048)

### Parallel Opportunities

- Phase 2 tests T006–T009: four files, no overlap
- US1: T020, T021, T022, T023 then T024 and T025 (core and connector in different packages)
- US2: T029–T034 then T035, T036, T037, T042 (WMO table, client, place maths, mock server) and T043, T045
- US3: T046 and T047 then T048 → T049
- US4: T050–T053 then T054, T055 (two core files) and T057 alongside T056's builder work
- Across stories: after Phase 2, US1 and US2 can run on two branches, touching only `widget-figures.ts`, `WidgetStrip.vue` and `WidgetSettingsSheet.vue` in common

---

## Parallel Example: User Story 2

```bash
# Tests first, all in parallel (six files):
Task: "Record Open-Meteo fixtures + contract test in packages/connectors/src/open-meteo/client.test.ts and wmo.test.ts"
Task: "Unit tests in packages/core/src/widgets/place.test.ts"
Task: "API tests in apps/api/test/places.test.ts"
Task: "API tests in apps/api/test/widgets-weather.test.ts"
Task: "Playwright tests/e2e/tests/widgets.spec.ts (weather)"
Task: "e2e-local tests/e2e/tests/widgets.local.spec.ts"

# Then the four independent implementations:
Task: "packages/connectors/src/open-meteo/wmo.ts"
Task: "packages/connectors/src/open-meteo/client.ts + fake.ts"
Task: "packages/core/src/widgets/place.ts"
Task: "infra/mocks/src/open-meteo.ts + fixtures helper"

# Then sequentially: T038 places service → T039 places routes → T040 refresh/purge jobs → T041 weather builder → T044 WeatherWidget.vue
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + US1)

1. Phase 1 setup, Phase 2 foundational (tables, routes, strip with empty state on the month view)
2. US1 currency widget with the Frankfurter backfill
3. **STOP and VALIDATE**: US1 independent test in ci; SC-001 asserted in the API suite
4. Flip `widgets.currency` in production; the strip ships with one kind

### Incremental Delivery

1. Slice A (Phase 2 + US1) → strip and currency widget behind `widgets.currency`
2. Slice B (US2) → weather widget, places, jobs, privacy text behind `widgets.weather`
3. Slice C (US3) → reorder and duplicate (no flag; arrangement is core behaviour)
4. Slice D (US4) → spend pace, fixed costs, sunrise behind their three flags
5. Slice E (T060) → Today page strip once spec 002 Slice A exists

### Parallel Team Strategy

One developer working evenings (constitution rationale): follow the slice order. If a second pair of hands appears, split after Phase 2: one on US1 (rate maths, range client, backfill), one on US2 (Open-Meteo client, places, refresh jobs); merge before US3 and US4.

---

## Notes

- [P] tasks touch different files and depend on nothing incomplete
- Never push, open a PR or merge without Rostom's explicit instruction; commit locally per task
- Every PR: test shown before change, `CHANGELOG.md` line, coverage not lower, Lighthouse green where a page changed, ownership matrix extended, `worker-build` green
- No new dependency anywhere in this feature: Open-Meteo and Frankfurter over `fetch`, reorder over pointer events (plan Technical Context, Principle VI)
- Money in spend pace and fixed costs is integer minor units from the baseline `Money` type; rate changes use scaled-integer strings; no floats (Principle III)
- The privacy text (T045) ships with Slice B (US2) per FR-014, plan.md's delivery map and research §Owner decisions; it must land before `widgets.weather` flips in production
