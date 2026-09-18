# Implementation Plan: Dashboard Widgets

**Branch**: `003-dashboard-widgets` (spec); delivery branches `phase-N/widgets-*` per the roadmap
phase the slice lands in | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-dashboard-widgets/spec.md`

## Summary

A widget strip on the expenses month view and, once spec 002 ships, on the Today page, sharing
one per-user arrangement of up to eight widgets: currency (rates from the existing `fx_rates`
cache, backfilled thirty-one days on add via Frankfurter's date-range endpoint), weather and
sunrise/sunset (Open-Meteo, ADR-0005, cached once per place on the server), and two widgets
computed from the user's own expense data (spend pace, upcoming fixed costs) using the baseline
month-summary and forecast functions in `packages/core`. Widgets are rows in one `widgets` table
with typed JSON settings validated per kind; readings live in shared, non-user-owned caches like
`fx_rates`. No new dependency; every external call is `fetch`.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22 LTS, pnpm workspaces; unchanged from the
baseline.

**Primary Dependencies**: baseline only (Hono, Vue 3, Pinia, Drizzle, zod, Vitest, Playwright,
fast-check). No additions: Open-Meteo and Frankfurter are called with `fetch`; drag-to-reorder
uses platform pointer events plus keyboard handlers, not a drag library (Principle VI).

**Storage**: Postgres tables `widgets`, `places` (user-owned) and `weather_readings`,
`geocode_cache` (shared, like `fx_rates`); `users.temperature_unit`; `fx_rates` reused for rate
history. See data-model.md.

**Testing**: Vitest unit and property tests in `packages/core/src/widgets/` (rate change maths,
spend pace, fixed-cost "usual amount", coordinate rounding, WMO code mapping); recorded fixtures
and a fake for the Open-Meteo client and for Frankfurter's range endpoint in
`packages/connectors`; API suite with Testcontainers including the ownership matrix for every
widget route; Playwright `ci` against the mocks container (fake Open-Meteo); axe and Lighthouse
on the month view with eight widgets; e2e-local nightly against the real Open-Meteo for one
place (SC-004).

**Target Platform**: as the baseline (Fly Node container, then Cloudflare Workers; PWA at 360 px
and up). Nothing runtime-specific.

**Project Type**: web application monorepo; this feature adds one strip component with five
widget kinds, one settings sheet, one job family and nine routes.

**Performance Goals**: strip shows cached figures within one second on a mid-range phone;
month view load not lengthened by more than 100 ms (strip is a lazy chunk mounted after the
month data resolves); `GET /widgets` under 150 ms server-side at eight widgets; weather reading
never older than one hour for an active place.

**Constraints**: eight widgets per user; six currencies per currency widget; readings shared per
place keyed on coordinates rounded to two decimals; hourly weather refresh only for places with
a user active in the last 24 hours; place search three characters, debounced, ten per user per
minute, results cached one day; Open-Meteo free-tier quota (ADR-0005) never exceeded and
exhaustion handled as a stale state; feature flag per widget kind; English UI.

**Scale/Scope**: 1,000 users × up to eight widgets; a few hundred distinct places; well under
1,000 Open-Meteo calls per day; one strip reused on two pages; five widget kinds.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Before research | After design |
|-----------|------|-----------------|--------------|
| I. Test-First | Every story has an independent test; pure maths (rate changes, spend pace, usual amount, coordinate rounding) is property-tested in `packages/core`; the Open-Meteo client ships with fixtures and a fake validated against them; every new route enters the ownership matrix | Pass | Pass (quickstart names the proving test per slice) |
| II. One Codebase, Two Runtimes | All external calls are `fetch`; no new dependency; jobs go through the existing `JobRunner` | Pass | Pass |
| III. Money Is Exact | Spend pace and fixed costs reuse the baseline `Money` type and month-summary functions; rate changes are computed on the `numeric` rates as decimal strings and only formatted at the edge; no floats for amounts | Pass | Pass (research R6) |
| IV. Every User Is an Island | `widgets` and `places` carry `user_id` with cascade; shared caches (`weather_readings`, `geocode_cache`) hold no user data, like `fx_rates`; export includes widgets and places, never cached readings; every route scoped by owner | Pass | Pass (data-model cascade section) |
| V. Decide Once, Write It Down | Weather source recorded in ADR-0005 (accepted 2026-09-17); rate source unchanged (ADR-0001); clarifications recorded in the spec; CLAUDE.md updated in the same change | Pass | Pass |
| VI. Simplicity and Finished Surfaces | One `widgets` table with typed JSON settings, not a table per kind; one strip and one frame component with a kind switch; no drag library; every widget has loading, empty, stale, error and unavailable states; a flag per kind | Pass | Pass (Complexity Tracking: no violations) |

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard-widgets/
├── plan.md              # This file
├── research.md          # Phase 0: sources, storage shape, refresh, throttling, maths
├── data-model.md        # Phase 1: tables, settings schemas, cascade rules
├── quickstart.md        # Phase 1: proving each slice
├── contracts/
│   ├── api.md           # widget, place and settings routes
│   └── sources.md       # WeatherSource and rates-range client contracts, fixture rules
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── components/widgets/WidgetStrip.vue          # lazy chunk; ordered widgets, add button, empty state
├── components/widgets/WidgetFrame.vue          # shared frame: title, as-of, states, settings/remove, keyboard reorder
├── components/widgets/CurrencyWidget.vue, WeatherWidget.vue, SunriseWidget.vue,
│                      SpendPaceWidget.vue, FixedCostsWidget.vue
├── components/widgets/AddWidgetSheet.vue       # catalogue from /widgets/types
├── components/widgets/PlacePicker.vue          # typed search + "use my current location"
├── stores/widgets.ts                           # list, add, patch, reorder, remove, refresh, poll while visible
└── views/MonthView.vue, views/TodayView.vue    # mount <WidgetStrip> after their own data resolves

apps/api/src/
├── routes/widgets.ts                           # /widgets, /widgets/types, /widgets/order, /widgets/refresh
├── routes/places.ts                            # /places/search, /places/resolve
├── services/widgets.ts                         # CRUD, caps, ownership, settings validation per kind
├── services/widget-figures.ts                  # builds each widget's figures for GET /widgets
├── services/places.ts                          # search with throttle + cache, approximate device-location resolution (research R1), rounding
├── jobs/widgets-weather-refresh.ts             # hourly per active place
├── jobs/widgets-rates-backfill.ts              # on currency add: 31-day range into fx_rates
└── jobs/widgets-purge.ts                       # readings and geocode cache older than 7 days

packages/connectors/src/
├── open-meteo/   # client (search, forecast), fake, fixtures, WMO code table
└── rates/        # existing Frankfurter client gains `range(from, to, base, quotes)` + fixture

packages/core/src/widgets/
├── rate-change.ts        # previous-day and 30-day change from a date-ordered rate list
├── spend-pace.ts         # spend so far, budget sum, percent, days left, daily-to-budget
├── fixed-costs.ts        # usual amount rule, remaining fixed categories, total expected
├── place.ts              # coordinate rounding, cache key
└── settings.ts           # zod schema per widget kind, caps

packages/contracts/src/widgets.ts, places.ts   # route schemas
packages/db/src/schema.ts                        # four new tables + users.temperature_unit; migration `widgets`
infra/mocks/src/open-meteo.ts                    # fake exposed to compose and e2e-ci
tests/e2e/tests/widgets.spec.ts                  # ci; `widgets.local.spec.ts` nightly
apps/landing/src/pages/privacy.vue               # Open-Meteo section from packages/contracts/src/privacy-text.ts
```

**Structure Decision**: the feature is added inside the existing layout. One strip component and
one frame component carry all shared behaviour; each widget kind is a small presentational
component fed by figures the API already computed, so the client holds no widget logic beyond
display and unit conversion. Pure maths lives in `packages/core` for property testing. The
Open-Meteo client follows the rates and Notion pattern (real client, fake, fixtures).

## Phase Delivery Map

| Slice | Spec stories | Ships | Gate |
|-------|--------------|-------|------|
| A. Strip, currency widget, add/remove | US1, US3 (add, remove, settings) | tables, `/widgets` routes, strip on the month view with empty state, currency widget with backfill job, flags | ownership matrix, rate-change property tests, Frankfurter range fixture, Playwright month view + axe, Lighthouse delta ≤ 100 ms |
| B. Weather widget and places | US2 | Open-Meteo client + fake + mocks, places routes with throttle and cache, weather refresh and purge jobs, PlacePicker with device-location button, `temperature_unit`, privacy text | Open-Meteo fixtures, places API suite, Playwright weather with mocks, privacy page snapshot, e2e-local one real place nightly |
| C. Arrange | US3 (reorder, duplicate) | `/widgets/order`, pointer and keyboard reorder with announcements, duplicate | API suite for order, Playwright keyboard reorder with live-region assertions |
| D. Expense widgets and sunrise | US4 | spend pace, fixed costs, sunrise widgets | property tests against the month summary, Playwright seeded month |
| E. Today page strip | FR-001 second surface | mount `<WidgetStrip>` on TodayView once spec 002's Slice A exists | Playwright: same arrangement on both pages |

## Complexity Tracking

No constitution violations to justify. Two deliberate simplifications, recorded so they are not
mistaken for omissions:

| Simplification | Ceiling | Upgrade path |
|----------------|---------|--------------|
| Reorder is a full `PUT /widgets/order` with the complete id list, last save wins | Two tabs reordering at once overwrite each other (spec edge case accepts this) | Per-widget `position` PATCH with a version check if ever needed |
| Weather readings are refreshed by a single hourly job scanning active places | Fine to tens of thousands of places; one job, no queue | Shard by coordinate prefix if the scan exceeds the tick budget |
