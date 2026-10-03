# Quickstart: proving the Dashboard Widgets

Builds on the baseline quickstart (`specs/001-phased-product-baseline/quickstart.md`); the same
compose stack and commands apply. New environment variable: `OPEN_METEO_API_BASE` (defaults to
the real hosts; in compose the mocks container provides `http://mocks:4000/open-meteo`). Flags
`widgets.*` are on in local and e2e-ci.

```sh
docker compose -f infra/docker-compose.yml up --build --wait
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:api && pnpm worker:build
pnpm test:e2e -- --project=ci
```

## Slice A: strip and currency widget (US1, US3 add/remove/settings)

1. Property tests `packages/core/src/widgets/rate-change.test.ts`: previous-day and 30-day
   changes from a date-ordered list; history not reaching back 30 calendar days yields `since`; direction and
   one-decimal percentages; no floats.
2. Contract test `packages/connectors/src/rates/range.test.ts` against `range-*.json` for the
   real client and `FakeRates`.
3. API suite `apps/api/test/widgets.test.ts`: add currency widget (backfill job enqueued and,
   when run against the fake, 31 `fx_rates` rows appear), seventh currency refused, default
   currency refused, ninth widget refused with `limit_reached`, PATCH settings, DELETE; the
   widget's `rate` and `rateDate` equal those written on an expense created the same day
   (SC-001); ownership matrix extended with every route in `contracts/api.md`.
4. Playwright `tests/e2e/tests/widgets.spec.ts` (ci): month view empty state offers widgets;
   add currency widget with EUR; rate, date and both changes visible; weekend (frozen clock)
   names the Friday; axe on empty, loading, ready, stale and error states at 360 px and
   desktop; Lighthouse on `/` with and without eight widgets, delta ≤ 100 ms (SC-003).
5. Clarify 2026-10-03 (API suite): change the default currency to a code already in the widget
   → that row returns `isDefault: true`, settings unchanged, and changing the default back
   restores its figures; make the fake range call fail on add → widget created, today's rate
   shown, `changesPending: true`, and the next daily rate fetch enqueues the backfill;
   `GET /healthz/widgets` reports the range call in `frankfurter.range` counts.
6. Expected outcome: US1 independent test passes; strip on the month view only.

## Slice B: weather widget and places (US2)

1. Contract test `packages/connectors/src/open-meteo/client.test.ts` against the fixtures for
   the real client and `OpenMeteoFake`; `wmo.test.ts` covers every code.
2. Unit tests `packages/core/src/widgets/place.test.ts`: rounding to two decimals, cache key
   equality for nearby coordinates.
3. API suite `apps/api/test/places.test.ts`: search needs three characters, returns homonyms
   with country, eleventh search in a minute answers 429, second identical search across two
   users hits the cache (fake call count unchanged), `source_paused` while
   `widgets.weather_paused_until` is set; `resolve` never persists coordinates (assert `places`
   and `audit_log` rows); `apps/api/test/widgets-weather.test.ts`: reading shared between two
   users with the same rounded place, refresh job fetches only active places, 429 from the fake
   sets the pause value, stale after one hour, `temperatureUnit` round-trips through `/me`;
   only places of users with `last_active_at` within 24 hours are refreshed;
   `apps/api/test/health-widgets.test.ts`: 200 when healthy, 503 while paused, 200 after two
   failed calls and 503 after the third, still 503 a day later with no calls, 200 after one
   success, counts increment per call, body is `{ status }` only; the daily summary log line
   carries the counts and names the source and cause (SC-008).
4. Playwright (ci): add weather widget by typing "Manch" → choose Manchester, UK; temperature
   and outlook appear; switch to °F; mock pause → stale with "source limit reached"; "use my
   current location" with Playwright geolocation granted → confirmation of the nearest place;
   denied → typed search still works; removing the widget removes the place from Settings and
   export; privacy page snapshot contains the Open-Meteo section and the device-location
   sentence (FR-014).
5. e2e-local `widgets.local.spec.ts` (`@local`, nightly): one real place through Open-Meteo,
   reading age sampled hourly for SC-004.
6. Expected outcome: US2 independent test passes.

## Slice C: arrange (US3 reorder, duplicate)

1. API suite: `PUT /widgets/order` with the full id list, a foreign id → `not_found`, a missing
   id → 422; duplicate copies settings and place at the last position.
2. Playwright (ci): pointer drag reorders and persists across reload; keyboard "move up" with a
   live-region assertion (`aria-live` text contains the new position); same order on a phone
   viewport after sign-in.
3. Expected outcome: US3 independent test passes.

## Slice D: expense widgets and sunrise (US4)

1. Property tests `packages/core/src/widgets/spend-pace.test.ts` and `fixed-costs.test.ts`
   against generated month summaries: spent + remaining budget invariant, days left in the
   user's zone, usual amount is the budget whenever set, else previous month, else none;
   first-of-month with no expenses yields zero spent and no division error.
2. API suite: with a seeded month (budget, Rent recorded, Internet not), spend pace equals the
   month view's totals; fixed costs lists Internet only; sunrise widget reuses the weather
   widget's place and reports `showZone` only when zones differ; with two weather widgets the
   sunrise widget takes the top one's place, and changing either place afterwards leaves the
   other unchanged; a polar fixture returns `polar: 'day'`; with the user's zone at UTC+13 and
   UTC-10 near midnight, days left and the month window equal the month view's.
3. Playwright (ci): all three widgets render from seeded data with no Open-Meteo call for the
   first two (mock call count).
4. Expected outcome: US4 independent test passes.

## Slice E: Today page strip (spec 002 shipped)

1. Playwright (ci, `panels.today` on): the same arrangement appears on `/today` and `/`; a
   reorder on one is visible on the other after reload; the strip renders after the calendar
   and inbox panels and still renders when the mocked Today endpoint errors.
2. Playwright (ci, `panels.today` off): `/today` redirects as before, the strip shows on `/`
   with the same widgets and order.
3. Unit (`stores/widgets.test.ts`): polling stops while the document is hidden and refreshes on
   return when a reading is past its window.
4. Lighthouse/Playwright timing on `/today` with mocked panels, with and without eight
   widgets: the calendar and inbox panels appear no more than 100 ms later (SC-003).

## Cross-slice gates

- Coverage on `packages/core` and `apps/api` at or above 85 % lines.
- Lighthouse on `/` (eight widgets) and `/settings`: performance ≥ 90, accessibility ≥ 95.
- `pnpm worker:build` green (no new dependency; `fetch` only).
