# Quickstart: proving the Web UI Refresh

Builds on the baseline quickstart (`specs/001-phased-product-baseline/quickstart.md`). New
environment variable: `VITE_UI_CATALOGUE=true` (set by the dev server and preview deployments;
absent in production) mounts the catalogue at `/__ui`.

```sh
docker compose -f infra/docker-compose.yml up --build --wait
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm worker:build
pnpm test:e2e -- --project=ci
```

Snapshot baselines are rendered only in the pinned Playwright image (spec FR-018): trigger the
`update-snapshots` workflow and commit its artifact, or run the same image locally:

```sh
docker run --rm -v "$PWD:/work" -w /work/tests/e2e -e E2E_BASE_URL=http://host.docker.internal:5173 \
  mcr.microsoft.com/playwright:v<pinned>-noble npx playwright test --project=visual --update-snapshots
```

## Slice A0: baselines (before any token change)

1. Pin `@playwright/test` exactly; add the `visual` project with the config-level tolerance
   (`maxDiffPixelRatio: 0.005`, animations disabled); remove the per-call `maxDiffPixels` from
   `year.spec.ts` and re-render its baselines in the image.
2. Write `tests/e2e/fixtures/journey.ts` and `tests/e2e/tests/journeys.spec.ts`; run them on
   `main` and commit `journey-baseline.json`.
3. Expected outcome: `pnpm test:e2e -- --project=ci` and the `visual` job pass with no product
   change; this merges before Slice A's token change.

## Slice A: direction, tokens, mock-ups (US1)

1. Tool setup, with the owner present (research R11): `npx impeccable install` then
   `/impeccable init`; `npx skills add https://github.com/Leonxlnx/taste-skill`; clone
   awesome-design-md to a scratch folder and copy the shortlisted DESIGN.md files into
   `docs/design/references/` with the MIT notice; optionally `skillui --url <reference>`
   outside the repo; the owner adds the Magic UI MCP if wanted.
2. Failing tests first: `packages/ui/src/tokens.test.ts` (every token name in
   contracts/tokens.md exists in light and both dark blocks; every contrast pair meets its
   ratio; drift scan of `apps/web/src` and `packages/ui/src/components`; every component has a
   story); `tests/e2e/tests/visual.spec.ts` for `/__ui` and the four mock-ups at 2 × 2; axe on
   every catalogue cell; a build test asserting `dist/` contains no `catalogue` chunk when
   `VITE_UI_CATALOGUE` is unset. Seed `drift-pending.json` from the first drift run.
3. Write `DESIGN.md` (data-model.md §Design direction) and
   `docs/adr/ADR-0006-visual-identity.md` (proposal plus fallback); extend `tokens.css`;
   refresh the existing blocks and promote `PanelState`, `WidgetFrame` and `ForecastTile`;
   build `CatalogueView.vue` and the four mock-ups (three "after" plus the fallback month view) over
   `catalogue/fixtures.ts`; add `.github/workflows/update-snapshots.yml`.
4. Owner review on the preview URL: `/__ui` and `/__ui/mockups/*` in both themes at phone and
   desktop width; the owner accepts ADR-0006 or chooses the fallback (spec SC-001) and runs
   the SC-002 preference test (`needs-rostom`).
5. Expected outcome: US1 independent test passes; the direction is in an approved state.

## Slice B: screens (US2)

1. Failing tests first, per change: its cases in `visual.spec.ts` (2 x 2), axe in both themes,
   its files removed from `drift-pending.json` (the drift test then fails until they are
   clean), its journeys in `journeys.spec.ts` at or under `journey-baseline.json` (SC-005), and
   Lighthouse in `tests/e2e/lighthouserc.json` for `/` and `/settings`.
2. Refresh using blocks only (contracts/blocks.md §Screen composition).
3. Order, one change each: B1 `MonthView`, B2 `AddView` + `ExpenseForm`, B3 `CategoriesView` +
   `CategoryView`, B4 `SettingsView`, B5 `LoginView`, B6 `TodayView` + `components/today/*`.
   Then grouped: B7 register, verify, forgot, reset, onboarding, hello; B8 year, import, bin;
   B9 capture, connectors, connections + `StandardsForm`; B10 `components/widgets/*`. Flagged
   screens are tested with their flags on; no flag changes in production.
4. After B6, the owner runs the screen-reader pass on the preview deployment (NVDA on Windows,
   VoiceOver on iPhone; SC-003, `needs-rostom`).
5. Expected outcome: US2 independent test passes on a phone and a laptop profile in e2e-ci;
   `drift-pending.json` holds only `apps/landing` files.

## Slice C: blocks complete (US3)

1. Failing tests: inventory check in `tokens.test.ts` lists every block in contracts/blocks.md
   with a story and every variant × state cell present in `/__ui`; drift scan extended to
   `apps/landing/src`.
2. Contributor exercise: following `DESIGN.md` §Building a new panel, add a
   throw-away `DemoPanel.vue` with title, list, loading and empty states from blocks only; time
   it (target under thirty minutes); its snapshot and axe cases pass first time; delete it.
   Timed with a person this is SC-006 and `needs-rostom`.
3. Expected outcome: US3 independent test passes; SC-007 enforced by `pnpm test:unit`.

## Slice D: landing page (US4)

1. Failing tests: `tests/e2e/tests/landing.spec.ts` phone snapshot and axe; Lighthouse on the
   built site; a test that every `apps/landing/public/screenshots/*.png` referenced by
   `index.vue` exists and was produced by `screenshots.spec.ts` (manifest file check).
2. Apply the tokens to `apps/landing`, generate screenshots through the `update-snapshots`
   workflow, place the three-step explanation and sign-up above the fold; remove the landing
   files from `drift-pending.json` and delete the empty file (SC-007).
3. Expected outcome: US4 independent test passes; publication waits for ADR-0002; SC-008 is
   run by the owner with three people (`needs-rostom`).

## Cross-slice gates

- Coverage on `packages/core` and `apps/api` unchanged (no code there is touched).
- Lighthouse performance ≥ 90, accessibility ≥ 95 on `/`, `/settings` and the landing page on
  the mobile profile.
- `pnpm worker:build` green (no new dependency).
- Every PR names its intended snapshot changes; unexplained pixel diffs block merge.
- The feature is done only when `docs/ROADMAP.md` records SC-002, SC-003 (screen reader),
  SC-006 and SC-008; none of them blocks a merge.
