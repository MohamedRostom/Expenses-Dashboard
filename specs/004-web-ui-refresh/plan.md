# Implementation Plan: Web UI Refresh

**Branch**: `004-web-ui-refresh` (spec); delivery branches `phase-4/ui-*` per slice | **Date**:
2026-09-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-web-ui-refresh/spec.md`

## Summary

A design direction written as `docs/design/DESIGN.md` (with a proposed identity in ADR-0006 and a
refinement fallback), applied to the existing app screen by screen through an extended token
file and a documented set of shared blocks in `packages/ui`, with a dev-only catalogue route that
hosts the blocks and the coded "after" mock-ups. Quality is enforced by tests that already have
a home: a token-drift and contrast test in Vitest, Playwright visual snapshots rendered in CI,
axe and keyboard journeys, and the Lighthouse budgets. The landing page adopts the same tokens
last, with screenshots generated from the refreshed app. No new dependency; the six tools the
owner named are authoring aids used in Slice A.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22 LTS, pnpm workspaces; unchanged.

**Primary Dependencies**: baseline only (Vue 3, Vite, vue-router, Pinia, `vite-ssg` for the
landing page, Vitest, Playwright with axe, `@lhci/cli`). No additions: motion via CSS and Vue
`<Transition>`, catalogue as an in-app route, snapshots via Playwright `toHaveScreenshot`,
token drift via a Vitest regex test (research R3–R7).

**Storage**: N/A. No table, migration or API change; the only new data is static
(`tokens.css`, fixtures for the catalogue, generated screenshots).

**Testing**: Vitest `packages/ui/src/tokens.test.ts` (drift, contrast pairs); Playwright `ci`
`visual.spec.ts` (Chromium, 360 and 1280 wide, light and dark), `keyboard.spec.ts` (five core
flows keyboard-only), axe on every catalogue state and refreshed screen; Lighthouse on `/`,
`/settings` and the landing page; snapshot baselines produced by an `update-snapshots`
workflow_dispatch job, never locally (research R6).

**Target Platform**: as the baseline (PWA at 360 px and up, Chromium and WebKit in e2e-ci);
nothing server-side changes, so Stage 2 is unaffected.

**Project Type**: web application monorepo; this feature adds one document, one ADR, a token
extension, a block set, one dev-only route with four mock-ups, seven test files and one CI job.

**Performance Goals**: Lighthouse performance ≥ 90 and accessibility ≥ 95 on `/`, `/settings`
and the landing page on the throttled mobile profile after each slice; every transition under
300 ms and disabled under reduce-motion; no layout animation on the expenses table.

**Constraints**: WCAG 2.2 AA (4.5:1 text, 3:1 large text and controls, 2 px focus ring at 3:1);
44 px tap targets; no value outside the token scales on any screen (drift test); screen by
screen rollout with no runtime switch and never two token sets; catalogue route absent from the
production bundle; no proprietary asset from any reference system; identity change only after
ADR-0006 is accepted.

**Scale/Scope**: five core flows, roughly eight screens at Phase 4 start, twelve to fifteen
blocks, three coded mock-ups, one landing page; snapshot matrix of about forty images.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Before research | After design |
|-----------|------|-----------------|--------------|
| I. Test-First | Each slice names its failing test first: token drift and contrast (Vitest), visual snapshots, axe, keyboard journeys, Lighthouse; no route changes so the ownership matrix is untouched | Pass | Pass (quickstart names the test per slice) |
| II. One Codebase, Two Runtimes | Web-only change; nothing touches `apps/api`; no dependency added so `worker-build` is unaffected | Pass | Pass |
| III. Money Is Exact | No money logic changes; tabular figures (FR-011) are presentation only and use the baseline formatter | Pass | Pass |
| IV. Every User Is an Island | The catalogue route renders fixtures only, never calls the API, and is excluded from production builds; landing screenshots come from seeded test data | Pass | Pass (research R5, R10) |
| V. Decide Once, Write It Down | New identity via ADR-0006 with an explicit fallback; DESIGN.md referenced from CLAUDE.md; reference systems and licences recorded in the direction | Pass | Pass |
| VI. Simplicity and Finished Surfaces | No Storybook, Tailwind, motion or snapshot service; every block ships with loading, empty and error states; error copy branches on cause; tokens from `packages/ui` only | Pass | Pass (Complexity Tracking: no violations) |

## Project Structure

### Documentation (this feature)

```text
specs/004-web-ui-refresh/
├── plan.md              # This file
├── research.md          # Phase 0: DESIGN.md convention, references, tokens, catalogue, snapshots, tools
├── data-model.md        # Phase 1: token model, block inventory, snapshot matrix, direction document shape
├── quickstart.md        # Phase 1: proving each slice
├── contracts/
│   ├── tokens.md        # token names, scales and theme contract every screen consumes
│   └── blocks.md        # block inventory: props, variants, states, a11y contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
docs/design/DESIGN.md                        # the direction: character, scales, roles, motion, conventions, kept/adjusted/replaced, fallback
docs/design/references/<name>.DESIGN.md     # the shortlisted references (research R2 is a preliminary recommendation), copied with MIT notice
docs/adr/ADR-0006-visual-identity.md         # proposed identity, decision, fallback

packages/ui/src/
├── tokens.css                               # extended: type, spacing, radii, elevation, colour roles, motion; reduce-motion override
├── tokens.test.ts                           # drift scan of apps/web, apps/landing, packages/ui; contrast pairs
├── components/                              # refreshed blocks: Button, Input, Select, Sheet, Toast, PanelFrame, Skeleton,
│                                            #   EmptyState, ErrorState, Tile, DataTable, Tabs, MenuButton, ThemeToggle, Kbd
└── index.ts

apps/web/src/
├── catalogue/CatalogueView.vue              # every block × variant × state, both themes side by side; fixtures only
├── catalogue/mockups/{MonthViewMock,AddExpenseMock,SettingsMock}.vue   # coded "after" mock-ups (FR-004)
├── catalogue/fixtures.ts                    # synthetic month, categories, user
├── router.ts                                # /__ui mounted only when VITE_UI_CATALOGUE === 'true'
└── views/*.vue, components/*.vue            # refreshed one screen per PR: MonthView, ExpenseForm, CategoriesView, SettingsView, auth views

apps/landing/src/pages/index.vue             # tokens shared; screenshots from apps/landing/public/screenshots/
apps/landing/public/screenshots/*.png        # generated by tests/e2e/tests/screenshots.spec.ts

tests/e2e/tests/visual.spec.ts               # snapshots: catalogue, mock-ups, refreshed screens × 2 widths × 2 themes
tests/e2e/tests/keyboard.spec.ts             # five core flows keyboard-only with focus assertions
tests/e2e/tests/screenshots.spec.ts          # landing screenshots generator (on demand)
tests/e2e/lighthouserc.json                  # /, /settings, landing on the mobile profile
.github/workflows/update-snapshots.yml       # workflow_dispatch: render baselines in the CI container, upload artifact
```

**Structure Decision**: everything visual flows from `packages/ui/src/tokens.css` and
`packages/ui/src/components`; the app and the landing page only compose them. The catalogue
and mock-ups sit inside `apps/web` so they use the real router, themes and build, but behind
a build-time variable so production never ships them. Tests live where the baseline already
puts them.

## Phase Delivery Map

| Slice | Spec stories | Ships | Gate |
|-------|--------------|-------|------|
| A. Direction, tokens, mock-ups | US1 | tool setup (research R11), reference shortlist, `docs/design/DESIGN.md`, ADR-0006 draft, extended `tokens.css`, refreshed blocks, catalogue route, three coded mock-ups, `update-snapshots` job | owner approves DESIGN.md and decides ADR-0006; drift and contrast tests green; catalogue snapshots and axe green; production bundle contains no catalogue chunk |
| B. Screens | US2 | month view, add expense, categories, settings, auth screens refreshed one PR each | per screen: snapshot at 2 × 2, axe, keyboard journey unchanged in steps, Lighthouse ≥ 90 / ≥ 95 |
| C. Blocks complete | US3 | catalogue covers every block with variants and states and a usage example; drift test extended to `apps/landing`; the "new panel in thirty minutes" walkthrough in `docs/design/DESIGN.md` | a contributor exercise (quickstart) passes first time; SC-007 automated |
| D. Landing page | US4 | landing page on the tokens, generated screenshots, three-step explanation above the fold | Lighthouse on the built site; phone snapshot; blocked for publication on ADR-0002 |

## Complexity Tracking

No constitution violations to justify. Two deliberate simplifications, recorded so they are not
mistaken for omissions:

| Simplification | Ceiling | Upgrade path |
|----------------|---------|--------------|
| Token drift is a regex scan of source files, not a CSS parser | Misses values built by string concatenation and inline `style` bindings computed in script | A Stylelint rule if the regex starts producing false negatives in review |
| Snapshots are Chromium-only at two widths | WebKit-specific rendering bugs are caught by the functional WebKit project, not by pixels | Add a WebKit snapshot project for the month view only if such a bug ships |
