# Implementation Plan: Web UI Refresh

**Branch**: `004-web-ui-refresh` (spec); one delivery branch per slice change, `phase-4/ui-*`
(the constitution's `phase-N/short-description` convention; the refresh refines roadmap Phase 4)
| **Date**: 2026-09-17, updated 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-web-ui-refresh/spec.md`

**Update 2026-10-04**: re-planned after the spec's 2026-10-04 clarifications. Phase 4 and specs
002–003 have shipped, so the plan now starts from the product as built: 18 routed screens, the
Today panels and the widget strip, eight blocks and four charts already in `packages/ui`, and
`PanelState`, `WidgetFrame` and `ForecastTile` living in `apps/web` where they should be blocks.
New in this revision: every signed-in screen is in scope (Slice B grows to grouped changes),
snapshots run in the pinned Playwright container with a 0.5 % tolerance (FR-018), the drift test
ratchets through a pending-files list instead of failing on day one, the "before" journey
counts are a committed baseline file, and the people-based checks are `needs-rostom` gates on
"done", not on merges.

## Summary

A design direction written as `DESIGN.md` (with a proposed identity in ADR-0006 and a
refinement fallback), applied to the existing app screen by screen through an extended token
file and a documented set of shared blocks in `packages/ui`, with a dev-only catalogue route that
hosts the blocks and the coded "after" mock-ups. Quality is enforced by tests that already have
a home: a token-drift and contrast test in Vitest, Playwright visual snapshots rendered in the
pinned Playwright container, axe and keyboard journeys with step counts held against a committed
baseline, and the Lighthouse budgets. The landing page adopts the same tokens last, with
screenshots generated from the refreshed app. No new dependency; the six tools the owner named
are authoring aids used throughout: in Slice A to choose the direction, and in every Slice B–D
change as an audit before and a critique, detector run and finish review after (tasks.md
§Design tools in use), recorded in each change's Design tools section.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22 LTS, pnpm workspaces; unchanged.

**Primary Dependencies**: baseline only (Vue 3, Vite, vue-router, Pinia, `vite-ssg` for the
landing page, Vitest, Playwright with axe, `@lhci/cli`). No additions: motion via CSS and Vue
`<Transition>`, catalogue as an in-app route, snapshots via Playwright `toHaveScreenshot`,
token drift via a Vitest regex test (research R3–R7). One version change: `@playwright/test` in
`tests/e2e/package.json` is pinned exactly (no caret) so the container image tag always matches
the installed library (research R6).

**Storage**: N/A. No table, migration or API change; the only new data is static
(`tokens.css`, catalogue fixtures, snapshot baselines, `drift-pending.json`,
`journey-baseline.json`, generated landing screenshots).

**Testing**: Vitest `packages/ui/src/tokens.test.ts` (drift with the pending-files ratchet,
contrast pairs through the existing `contrastRatio`, block inventory); Playwright project
`visual` (Chromium in `mcr.microsoft.com/playwright:v<pinned>-noble`, 360 × 800 and 1280 × 800,
light and dark, `maxDiffPixelRatio: 0.005`, animations disabled, clock frozen) runs every test
tagged `@visual` in any spec file, and the host-run projects (`ci`, `pixel-7`, `iphone-14`)
exclude that tag, so no `toHaveScreenshot` ever runs outside the pinned image;
`tests/e2e/tests/journeys.spec.ts` (five core flows, keyboard-only, counts taps, keystrokes and
screens against `tests/e2e/fixtures/journey-baseline.json`); axe on every catalogue state and
refreshed screen; Lighthouse on `/`, `/settings` and the landing page, the two app URLs
measured signed in through a session cookie the CI step obtains from the API and passes as
an extra header (until then `/` redirects and Lighthouse measures the sign-in page). Baselines come from the
`update-snapshots` workflow or the same image run locally through Docker (research R6).

**Target Platform**: as the baseline (PWA at 360 px and up, Chromium and WebKit in e2e-ci);
nothing server-side changes, so Stage 2 is unaffected.

**Project Type**: web application monorepo; this feature adds one document, one ADR, a token
extension, four new blocks, two promoted ones and refreshes of nine existing ones, one dev-only route with four
mock-ups, two baseline data files, about eight test files and one CI job.

**Performance Goals**: Lighthouse performance ≥ 90 and accessibility ≥ 95 on `/`, `/settings`
and the landing page on the throttled mobile profile after each change; every transition under
300 ms and disabled under reduce-motion; no layout animation on the expenses table.

**Constraints**: WCAG 2.2 AA (4.5:1 text, 3:1 large text and controls, 2 px focus ring at 3:1);
44 px tap targets on phone, 24 px on desktop (32 px dense rows); no value outside the token
scales on a refreshed file, and none anywhere once `drift-pending.json` is empty; screen by
screen rollout with no runtime switch and never two token sets; flagged screens refreshed
without changing any flag; catalogue route absent from the production bundle; no proprietary
asset from any reference system; identity change only after ADR-0006 is accepted.

**Scale/Scope**: 18 routed screens (7 in the six core changes, 11 in three grouped changes)
plus the app shell, the Today panels and the widget strip with its seven widgets (a fourth
grouped change); `HelloView.vue` is not routed and awaits the owner's decision. 15 blocks (8
refreshed in place, 2 promoted from `apps/web`, `DataTable` moved from `charts/`, 4 new) plus 3
hand-written charts; four coded mock-ups (three "after" plus the fallback month view), one
landing page; a snapshot matrix of roughly 150 images.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Checked against
constitution v1.1.1.

| Principle | Gate | Before research | After design |
|-----------|------|-----------------|--------------|
| I. Test-First | Each change names its failing test first: drift ratchet and contrast (Vitest), visual snapshots, axe, journey counts, Lighthouse; no route changes so the ownership matrix is untouched | Pass | Pass (quickstart names the test per slice) |
| II. One Codebase, Two Runtimes | Web-only change; nothing touches `apps/api`; no dependency added so `worker-build` is unaffected | Pass | Pass |
| III. Money Is Exact | No money logic changes; tabular figures (FR-011) are presentation only and use the baseline formatter | Pass | Pass |
| IV. Every User Is an Island | The catalogue route renders fixtures only, never calls the API, and is excluded from production builds; screen snapshots and landing screenshots use seeded test users only | Pass | Pass (research R5, R10) |
| V. Decide Once, Write It Down | New identity via ADR-0006 with an explicit fallback; DESIGN.md referenced from CLAUDE.md; reference systems and licences recorded in the direction. Principle VI names IBM Plex and the green accent, so an accepted identity that replaces either amends the constitution in the same change (owner-merged, ADR-0006 as its ADR); the fallback needs none | Pass | Pass (conditional amendment in tasks T028) |
| VI. Simplicity and Finished Surfaces | No Storybook, Tailwind, motion or snapshot service; every block ships with loading, empty and error states; error copy branches on cause; tokens from `packages/ui` only. The look change needs no flag (v1.1.1); existing feature flags are left as they are | Pass | Pass (Complexity Tracking: no violations) |

## Project Structure

### Documentation (this feature)

```text
specs/004-web-ui-refresh/
├── plan.md              # This file
├── research.md          # Phase 0: DESIGN.md convention, references, tokens, catalogue, snapshots, tools, ratchet, journey counts
├── data-model.md        # Phase 1: token model, block inventory, snapshot matrix, baseline files, direction document shape
├── quickstart.md        # Phase 1: proving each slice
├── contracts/
│   ├── tokens.md        # token names, scales, theme contract and drift rules every screen consumes
│   └── blocks.md        # block inventory: props, variants, states, a11y contract, where each comes from today
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
DESIGN.md                                    # the direction (root; replaces the 2026-10-05 incumbent capture): character, scales, roles, motion, conventions, kept/adjusted/replaced, fallback
docs/design/references/<name>.DESIGN.md     # the shortlisted references, copied with MIT notice
docs/adr/ADR-0006-visual-identity.md         # proposed identity, decision, fallback

packages/ui/src/
├── tokens.css                               # extended: type, spacing, radii, elevation, colour roles, motion, layout; reduce-motion override
├── tokens.test.ts                           # drift ratchet, contrast pairs (uses contrast.ts), block inventory
├── drift-pending.json                       # files not yet refreshed; shrinks with every screen change, empty at the end (SC-007)
├── components/                              # existing, refreshed: Button, Input, Select, Dialog (gains bottom/side placement = Sheet),
│                                            #   Toast, Skeleton, EmptyState, ErrorState
│                                            # new or promoted: PanelFrame (from apps/web PanelState + WidgetFrame), Tile (from
│                                            #   ForecastTile), Tabs, MenuButton, ThemeToggle, Kbd; DataTable moves here from charts/
├── components/*.story.ts                    # one per block (catalogue contract)
├── charts/                                  # CategoryBars, TrendSparkline, YearBars: hand-written SVG kept, restyled on tokens
└── index.ts

apps/web/src/
├── catalogue/CatalogueView.vue              # every block × variant × state, both themes side by side; fixtures only
├── catalogue/mockups/{MonthViewMock,AddExpenseMock,SettingsMock,MonthViewFallbackMock}.vue
├── catalogue/fixtures.ts                    # synthetic month, categories, user
├── router.ts                                # /__ui mounted only when VITE_UI_CATALOGUE === 'true'
└── views/*.vue, components/**/*.vue         # refreshed per the Slice B order below

apps/landing/src/pages/index.vue             # tokens shared; screenshots from apps/landing/public/screenshots/
apps/landing/public/screenshots/*.png        # generated by tests/e2e/tests/screenshots.spec.ts

tests/e2e/playwright.config.ts               # adds project `visual`; expect.toHaveScreenshot { maxDiffPixelRatio: 0.005, animations: 'disabled' }
tests/e2e/tests/visual.spec.ts               # catalogue, mock-ups, refreshed screens × 2 widths × 2 themes
tests/e2e/tests/year.spec.ts                 # existing snapshots: per-call maxDiffPixels removed, baselines re-rendered under FR-018
tests/e2e/tests/journeys.spec.ts             # five core flows keyboard-only; counts asserted against the baseline file
tests/e2e/fixtures/journey.ts                # counter wrapping click/fill/press/navigation
tests/e2e/fixtures/journey-baseline.json     # per-journey taps, keystrokes, screens recorded before the token change (SC-005)
tests/e2e/tests/screenshots.spec.ts          # landing screenshots generator (on demand)
tests/e2e/lighthouserc.json                  # adds /settings to the existing / and landing URLs
.github/workflows/ci.yml                     # new `visual` job: compose stack on the runner, Playwright in the pinned image
.github/workflows/update-snapshots.yml       # workflow_dispatch: render baselines in the pinned image, upload artifact
```

**Structure Decision**: everything visual flows from `packages/ui/src/tokens.css` and
`packages/ui/src/components`; the app and the landing page only compose them. Blocks that grew
inside `apps/web` during specs 001–003 (`PanelState`, `WidgetFrame`, `ForecastTile`) are
promoted into `packages/ui` rather than rebuilt, and `Dialog` gains placements instead of a
second `Sheet` component. The catalogue and mock-ups sit inside `apps/web` so they use the real
router, themes and build, behind a build-time variable so production never ships them. Tests
live where the baseline already puts them.

## Phase Delivery Map

| Slice | Spec stories | Ships | Gate |
|-------|--------------|-------|------|
| A0. Baselines | US2 prep | `journey-baseline.json` recorded on current `main`; `visual` project and CI job; `year.spec.ts` moved onto the global tolerance and re-baselined; `@playwright/test` pinned | journeys and existing snapshots green in the pinned image; merged **before** any token change |
| A. Direction, tokens, mock-ups | US1 | design tools (installed 2026-10-04, research R11; `/impeccable init` with the owner and the baseline audit in T024), reference shortlist, `DESIGN.md`, ADR-0006 draft, extended `tokens.css`, refreshed and promoted blocks, catalogue route, four coded mock-ups, `drift-pending.json` seeded with every unrefreshed file, `update-snapshots` job | owner approves DESIGN.md and decides ADR-0006 (SC-001), with a constitution amendment if the accepted identity replaces IBM Plex or the green accent; SC-002 run by the owner (`needs-rostom`); drift, contrast and inventory tests green; catalogue snapshots and axe green; production bundle has no catalogue chunk |
| B1–B6. Core screens | US2 | one change each, in order: month view, add expense (`AddView` + `ExpenseForm`), categories (`CategoriesView` + `CategoryView`), settings, sign-in (`LoginView`), Today (`TodayView` + its panels, flags on in test) | per change: its files leave `drift-pending.json`; snapshots at 2 × 2; axe; journey counts ≤ baseline; Lighthouse ≥ 90 / ≥ 95 |
| B0. Shell | US2 | `App.vue` header, navigation and feedback widget, so every later screen shares one header | same gates as B1 |
| B7–B10. Grouped screens | US2 | B7 account: register, verify, forgot, reset, onboarding (`HelloView` not routed, left for the owner); B8 data: year, import, bin; B9 settings sub-screens: capture, connectors, connections (+ `StandardsForm`); B10 widgets: the strip, seven widgets and their sheets, behind their existing `widgets.*` flags | same gates; no flag changes state; after B10 `drift-pending.json` holds only `apps/landing` files |
| C. Blocks complete | US3 | every block has a story with variants, states and a usage example; the "new panel in thirty minutes" walkthrough in DESIGN.md | inventory check green; SC-006 contributor exercise (`needs-rostom` if timed with a person, otherwise run by the agent and recorded) |
| D. Landing page | US4 | landing page on the tokens, generated screenshots, three-step explanation above the fold; its files leave `drift-pending.json`, which is then deleted | Lighthouse on the built site; phone snapshot; SC-007 automated; publication blocked on ADR-0002; SC-008 `needs-rostom` |
| Done | — | `docs/ROADMAP.md` records SC-002, SC-003 screen-reader pass (NVDA on Windows, VoiceOver on iPhone, on preview after B6), SC-006 and SC-008 | the feature is not called done until all four results are recorded; none of them blocks a merge |

## Complexity Tracking

No constitution violations to justify. Three deliberate simplifications, recorded so they are
not mistaken for omissions:

| Simplification | Ceiling | Upgrade path |
|----------------|---------|--------------|
| Token drift is a regex scan of source files, not a CSS parser | Misses values built by string concatenation and inline `style` bindings computed in script | A Stylelint rule if the regex starts producing false negatives in review |
| Snapshots are Chromium-only at two widths | WebKit-specific rendering bugs are caught by the functional WebKit project, not by pixels | Add a WebKit snapshot project for the month view only if such a bug ships |
| Journey counts come from wrapping Playwright actions, not from real input events | A step the app adds through script (an auto-focus that saves a tap) is invisible to the count | Count from DOM input events if a regression slips past the wrapper |
