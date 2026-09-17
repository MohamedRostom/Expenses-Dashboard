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
   changes from a date-ordered list; fewer than 31 dates yields `since`; direction and
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
5. Expected outcome: US1 independent test passes; strip on the month view only.

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
   sets the pause value, stale after one hour, `temperatureUnit` round-trips through `/me`.
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
   widget's place and reports `showZone` only when zones differ.
3. Playwright (ci): all three widgets render from seeded data with no Open-Meteo call for the
   first two (mock call count).
4. Expected outcome: US4 independent test passes.

## Slice E: Today page strip (after spec 002 Slice A)

1. Playwright (ci): the same arrangement appears on `/today` and `/`; a reorder on one is
   visible on the other after reload.

## Cross-slice gates

- Coverage on `packages/core` and `apps/api` at or above 85 % lines.
- Lighthouse on `/` (eight widgets) and `/settings`: performance ≥ 90, accessibility ≥ 95.
- `pnpm worker:build` green (no new dependency; `fetch` only).
