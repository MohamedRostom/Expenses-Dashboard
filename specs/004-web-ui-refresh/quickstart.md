# Quickstart: proving the Web UI Refresh

Builds on the baseline quickstart (`specs/001-phased-product-baseline/quickstart.md`). New
environment variable: `VITE_UI_CATALOGUE=true` (set by the dev server and preview deployments;
absent in production) mounts the catalogue at `/__ui`.

```sh
docker compose -f infra/docker-compose.yml up --build --wait
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm worker:build
pnpm test:e2e -- --project=ci
```

Snapshot baselines are never generated locally: trigger the `update-snapshots` workflow, download
its artifact and commit the files it changed.

## Slice A: direction, tokens, mock-ups (US1)

1. Tool setup, with the owner present (research R11): `npx impeccable install` then
   `/impeccable init`; `npx skills add https://github.com/Leonxlnx/taste-skill`; clone
   awesome-design-md to a scratch folder and copy the shortlisted DESIGN.md files into
   `docs/design/references/` with the MIT notice; optionally `skillui --url <reference>`
   outside the repo; the owner adds the Magic UI MCP if wanted.
2. Failing tests first: `packages/ui/src/tokens.test.ts` (every token name in
   contracts/tokens.md exists in light and both dark blocks; every contrast pair meets its
   ratio; drift scan of `apps/web/src` and `packages/ui/src/components`; every component has a
   story); `tests/e2e/tests/visual.spec.ts` for `/__ui` and the three mock-ups at 2 × 2; axe on
   every catalogue cell; a build test asserting `dist/` contains no `catalogue` chunk when
   `VITE_UI_CATALOGUE` is unset.
3. Write `docs/design/DESIGN.md` (data-model.md §Design direction) and
   `docs/adr/ADR-0006-visual-identity.md` (proposal plus fallback); extend `tokens.css`;
   refresh the blocks; build `CatalogueView.vue` and the three mock-ups over
   `catalogue/fixtures.ts`; add `.github/workflows/update-snapshots.yml`.
4. Owner review on the preview URL: `/__ui` and `/__ui/mockups/*` in both themes at phone and
   desktop width; the owner accepts ADR-0006 or chooses the fallback (spec SC-001).
5. Expected outcome: US1 independent test passes; the direction is in an approved state.

## Slice B: screens (US2), one PR per screen

1. Failing tests first, per screen: its cases in `visual.spec.ts` (2 × 2), axe in both themes,
   its journey in `tests/e2e/tests/keyboard.spec.ts` with the step count asserted equal to the
   count recorded before the refresh (SC-005), and Lighthouse in `tests/e2e/lighthouserc.json`
   for `/` and `/settings`.
2. Refresh the screen using blocks only (contracts/blocks.md §Screen composition); the drift
   test must stay green.
3. Order: `MonthView.vue`, `ExpenseForm.vue` and its sheet, `CategoriesView.vue`,
   `SettingsView.vue`, the auth views.
4. Expected outcome: US2 independent test passes on a phone and a laptop profile in e2e-ci.

## Slice C: blocks complete (US3)

1. Failing tests: inventory check in `tokens.test.ts` lists every block in contracts/blocks.md
   with a story and every variant × state cell present in `/__ui`; drift scan extended to
   `apps/landing/src`.
2. Contributor exercise: following `docs/design/DESIGN.md` §Building a new panel, add a
   throw-away `DemoPanel.vue` with title, list, loading and empty states from blocks only; time
   it (target under thirty minutes); its snapshot and axe cases pass first time; delete it.
3. Expected outcome: US3 independent test passes; SC-007 enforced by `pnpm test:unit`.

## Slice D: landing page (US4)

1. Failing tests: `tests/e2e/tests/landing.spec.ts` phone snapshot and axe; Lighthouse on the
   built site; a test that every `apps/landing/public/screenshots/*.png` referenced by
   `index.vue` exists and was produced by `screenshots.spec.ts` (manifest file check).
2. Apply the tokens to `apps/landing`, generate screenshots through the `update-snapshots`
   workflow, place the three-step explanation and sign-up above the fold.
3. Expected outcome: US4 independent test passes; publication waits for ADR-0002.

## Cross-slice gates

- Coverage on `packages/core` and `apps/api` unchanged (no code there is touched).
- Lighthouse performance ≥ 90, accessibility ≥ 95 on `/`, `/settings` and the landing page on
  the mobile profile.
- `pnpm worker:build` green (no new dependency).
- Every PR names its intended snapshot changes; unexplained pixel diffs block merge.
