# Session handoff: spec 004 T027a done (2026-10-06)

## Branch and commits
- Branch `phase-4/ui-baselines`, nothing pushed. T027a = `8e6ab27..c686771`.
- `1669661` is mis-titled: besides the widgets follow-up it carries Brief 4's month-view/add-expense/settings interactivity (two implementers committed at once). Local only; reword or leave.
- `router.ts` and `packages/ui/src/tokens.test.ts` show as modified only through CRLF (`git diff --ignore-cr-at-eol` is empty).

## What was built (owner review of T027)
- New mock-ups: `/__ui/mockups/today`, `/__ui/mockups/widgets` (strip + 5×5 state matrix + `?sheet=add-widget|widget-settings`).
- Every proposed mock-up interactive over fixtures, live simulation unless `?live=off`, fluid layout (container queries, `--text-display-fluid`, `--gutter-fluid`), motion intensity 3 → 5 (DESIGN.md §Motion, §Layout, §Mock-ups rewritten).
- Tests: `tests/e2e/tests/mockups.spec.ts` (31, @mockup, ci project) green; visual baselines re-rendered in the pinned image.

## Decisions and why
- Owner (2026-10-06): "dynamic" = interactive + live data + fluid; motion ~5; proposed identity only.
- Main session: stale widget = last value + amber lamp + "as of 09:07, not refreshed"; gutter 16px@360 → 32px@768; hover lift = Raised stacked twice (no third elevation); Display only on the departure tile, so the fluid Display test runs on month-view and add-expense only; skeleton pulse exempt from the 280 ms ceiling; axe checks run under reduced motion (it was sampling text mid settle-in); account chips use `--palette-*`; `dev-dist/` ignored.

## Known issues
- Visual compare runs in the compose dev server hit `page.goto` timeouts under parallel load (no pixel or contrast failures). Rerun with fewer workers if it bites.
- Detector advisory `cramped-padding` on `.mk-theme` (44px segmented control) and one header wrapper div; not fixed.

## Open questions for Rostom
- Review the new mock-ups, then T028 (ADR-0006) as before.
- Header link grouping (from T027) still open.

## Exact next step
Rostom reviews `/__ui/mockups/today`, `/widgets`, and the now-interactive month view/settings, then decides ADR-0006 (T028).
