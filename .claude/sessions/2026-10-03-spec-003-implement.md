# Handoff — spec 003 implement (2026-10-03)

**Branch:** `feature/003-dashboard-widgets`. **Last commit:** `82ebf79 ci: switch the widgets.* flags on for e2e-ci`. Nothing pushed (not asked).

## Uncommitted at handoff
- `tests/e2e/tests/widgets.spec.ts` (+~22 tests for T036, T050, T056), `tests/e2e/tests/widgets.local.spec.ts` (new, T037), `tests/e2e/fixtures/index.ts` (`enableWidgetFlags`, `psql`, `csrfHeaders`); 30/31 passed on the compose stack before the bug fix below.
- `specs/003-dashboard-widgets/tasks.md` box ticks.
- An implementer was still running at cut-off fixing three web bugs (below) in `apps/web/src/components/widgets/{AddWidgetSheet,WidgetStrip,WidgetFrame}.vue` (maybe a new `CurrencyPicker.vue`) and appending one e2e test. Review `git status` / `git diff` before committing.

## Open tasks
- T036, T037, T050, T056: specs written; commit once `widgets.spec.ts` is fully green (`cd tests/e2e && pnpm exec playwright test --project=ci tests/widgets.spec.ts --workers=3`; no `--` before args, `pnpm test:e2e -- ...` ignores the file filter). T037 is @local, typecheck only.
- T066: full quickstart run (lint, typecheck, test:unit, test:api, worker:build, e2e ci with `panels.*` and `widgets.*` flags on as in ci.yml), coverage >= 85 % on core and api, openapi not stale. Then tick T066, update the spec-003 paragraph in CLAUDE.md "Current state" (says "pending T066"), run the `speckit.companion.after-implement` hook.

## Known bugs (being fixed at cut-off)
1. Weather (and sunrise without a weather widget) cannot be added from the Add sheet: `WidgetStrip.vue:66` sends `{ kind }` with no place, silent 422.
2. Currency cannot be added from the Add sheet: same call, no currencies, silent 422.
3. Spend pace with no budget shows a skeleton: API returns `state: 'empty'` (kept by decision); web must render per-kind empty copy for spend_pace / fixed_costs.
Decided fix: Add sheet configure step (currency picker / PlacePicker), errors shown with role=alert; WidgetFrame renders empty copy for spend_pace and fixed_costs.

## Decisions made this session (and why)
- `Forecast.timeZone` added (resolve needs the zone); contracts/sources.md updated.
- Desk-owned weather icon names (`WEATHER_ICONS`); web uses inline SVG keyed by them (web can't import @desk/connectors).
- Currency: a code with no history is a `{ code, pending: true }` row; whole-widget error only when no row is ready (T069). fx_rates history in one window-function query (T072).
- `fixedCosts` owns budget, then previous month, then none; no `budgets` param. Coordinates round half away from zero.
- `ensurePlace` stays in services/widgets.ts; inline best-effort first reading on create/patch of weather/sunrise; `markDue` = `fetched_at = least(fetched_at, now-1h-1s)`; `/places/resolve` own 10/min limiter; no reading and no error gives `empty`.
- Lighthouse config unchanged (no new dep); SC-003 timing as Playwright assertions in widgets-perf.spec.ts.
- Review fixes: PlaceCandidate bounded + IANA-validated; widget jobs catch instead of rethrow, ensure is advisory-locked and treats `running` rows older than 10 min as dead; widget routes answer 422 via `apps/api/src/lib/parse.ts`; weather job backs off globally 10 min after 3 consecutive failures.
- Runbook lifts the weather pause with SQL (`pnpm flags set` can't clear `flags.value`).
- Worker uses the default OpenMeteoClient (no OPEN_METEO_API_BASE binding).

## Known failing / flaky
- `apps/api/test/imports.test.ts` SC-004 times out under parallel agent load; re-run alone.
- Locally the `pixel-7` / `iphone-14` projects fail ("Unsupported webkit channel msedge").
- Local compose DB has `widgets.*` default_on = true from e2e runs.

## Open questions for Rostom
- `checklists/spec-quality.md` has 88 unchecked reviewer items; implementation proceeded without it, as earlier phases did.
- Weather job: per-row backoff instead of the global 10-minute backoff?

## Exact next step
Check the bug-fix implementer's diff, run `pnpm --filter @desk/web test` and the widgets e2e spec, commit the fix and the e2e specs (T036, T037, T050, T056), tick them, then do T066.
