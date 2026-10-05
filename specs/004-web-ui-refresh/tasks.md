# Tasks: Web UI Refresh

**Input**: Design documents from `/specs/004-web-ui-refresh/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tokens.md, contracts/blocks.md, quickstart.md
**Generated**: 2026-09-17; **regenerated 2026-10-04** after the spec's 2026-10-04 clarifications and the re-plan (every screen in scope, FR-018 snapshot rule, drift ratchet, journey baseline, `needs-rostom` gates). No task from the 2026-09-17 list had been started, so IDs are renumbered from T001.

**Tests**: included and mandatory. The constitution (Principle I) requires every behaviour change to start with a failing test, so each phase lists its tests before its implementation and `/speckit-implement` must run them red first. Snapshot baselines are rendered only in the pinned Playwright image (spec FR-018, research R6): by the `update-snapshots` workflow or by the local `docker run` in quickstart.md, never by a host-installed browser.

**Starting point (checked 2026-10-04)**: Phase 4 and specs 002–003 are built. Already present and reused, not recreated: `packages/ui/src/tokens.css`, `contrast.ts` (`contrastRatio`), `palette.ts`; blocks `Button`, `Input`, `Select`, `Dialog`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`; charts `CategoryBars`, `DataTable`, `TrendSparkline`, `YearBars`; `vitest run` scripts in `packages/ui` and `apps/web`; `tests/e2e/fixtures/index.ts` (`axeCheck`, `signUpAndVerify`, `enableWidgetFlags`; `panels.*` flags are already on in `ci.yml`); `tests/e2e/lighthouserc.json` and the `lighthouse` step in `ci.yml`; `apps/landing` with `content.ts` and a deploy job gated by `LANDING_ENABLED` (off). Blocks living in `apps/web` to be promoted: `components/PanelState.vue` (used by 12 files), `components/widgets/WidgetFrame.vue`, `components/ForecastTile.vue`.

**Organization**: phases follow spec priority (US1 direction, US2 screens, US3 blocks, US4 landing). Foundational carries plan Slice A0 (baselines, merged before any token change) and the token, block and catalogue work that US1's mock-ups are built from. Nothing in `apps/api` or `packages/core` is touched.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (direction), US2 (screens), US3 (blocks), US4 (landing)
- Every task names its file(s); paths are repository-relative
- **`needs-rostom`**: the task needs the owner or real people; an agent prepares it and stops

## Path Conventions

Monorepo per plan.md: `packages/ui/src`, `apps/web/src`, `apps/landing/src`, `tests/e2e`, `docs/design`, `docs/adr`, `.github/workflows`.

## Design tools in use (owner's workflow, mandatory on every UI task)

Installed 2026-10-04 at user level (T002); none is a project dependency and nothing they generate is committed except where a task says so. Every task that changes how something looks runs the tools named for it below and records a **Design tools** section in its PR description (or commit body): which tool ran, on what, the findings, and what was fixed or why a finding was kept. A UI change without that section is not done (checked in review and in T053).

| Tool | How it is invoked | Used in |
|------|-------------------|---------|
| impeccable skill | `Skill: impeccable` (`/impeccable init` once, then its critique, audit and polish modes) | T024 (init + critique of current screens), T027 (mock-ups), every Slice B change (critique before merge), T051 |
| impeccable detector | `npx -y impeccable@4.1.0 detect` on the changed files, and on the running route with `--viewport 360x800` and `--viewport 1280x800`; reads `docs/design/DESIGN.md` once it exists | T027, T031–T042, T051; zero non-advisory findings, or each one justified in the PR |
| impeccable agents | `impeccable-finish-reviewer` after each screen change; `impeccable-documenter` at the end | T031–T042 (review), T052 (reconcile DESIGN.md with what shipped) |
| taste skills | `Skill: design-taste-frontend` (taste dials, anti-generic checks); `Skill: redesign-existing-projects` (audit-first on an existing screen) | T025 (dials), T027, every Slice B change (audit before refresh), T051 |
| awesome-design-md | the clone (re-clone `https://github.com/VoltAgent/awesome-design-md` outside the repo if the scratchpad was cleared) | T024 shortlist; only the three chosen files are copied into `docs/design/references/` |
| skillui | `skillui --url <reference site>` into the scratchpad | T024, optional, study material only |
| ui-ux-pro-max | `Skill: ui-ux-pro-max:ui-ux-pro-max` | T024 (palette and type options), T025 |
| Magic UI MCP | its MCP tools, for motion and micro-interaction ideas | T025 motion rules, T027; ideas only, no code copied (Desk is Vue, no motion dependency) |

Where the tools and the spec disagree (for example a taste skill preferring perpetual motion or asymmetric layouts), the spec, constitution and DESIGN.md win (spec §Design workflow, FR-002); the conflict is listed in the PR's Design tools section.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the planning set on a branch, the owner's design tools, the catalogue build switch, unit tests wired into CI, and the pinned Playwright image for snapshots.

- [x] T001 Create branch `phase-4/ui-baselines` from `main` and commit the planning set (`specs/004-web-ui-refresh/**`, excluding `specs/004-web-ui-refresh/.trace.jsonl`) so every delivery branch starts from it
- [x] T002 Tool setup from research R11. **Installed 2026-10-04 at user level**: impeccable 4.1.0 (`~/.claude/skills/impeccable` + four `impeccable-*` agents), taste skills `design-taste-frontend` and `redesign-existing-projects` (`~/.claude/skills/`), skillui 1.3.4 (npm global), Magic UI MCP `@magicuidesign/mcp@2.0.0` (user scope), awesome-design-md cloned to the session scratchpad; ui-ux-pro-max already present. Remaining: write `docs/design/TOOLS.md` on the T001 branch (one line per tool: version, scope, location, how to reinstall) and copy the §Design tools in use table into it; `/impeccable init` runs at the start of T024 with the owner present (`needs-rostom`)
- [x] T003 [P] Add `VITE_UI_CATALOGUE` to `.env.example` as a commented-out, optional build-time variable (comment: read by the `apps/web` build, not by `apps/api/src/env.ts`'s startup check; `true` on dev and preview only, absent in production), set it to `true` for the `web` service in `infra/docker-compose.yml` and in the preview build of `.github/workflows/deploy-preview.yml`, and leave it unset in `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-fly.yml`
- [x] T004 [P] Widen the root `test:unit` script in `package.json` to `pnpm -r --filter @desk/core --filter @desk/ui --filter @desk/web test` so the existing `vitest run` suites in `packages/ui` and `apps/web` run in CI's unit job; prove it by running `pnpm test:unit` and seeing `palette.test.ts` and `PanelState.test.ts` execute
- [x] T005 [P] Pin `@playwright/test` exactly in `tests/e2e/package.json` (drop the caret, keep the currently resolved 1.63.x version from `pnpm-lock.yaml`); in `tests/e2e/playwright.config.ts` add `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: 'disabled' }` at config level and a `visual` project (Chromium, `grep: /@visual/` over every spec file, base URL from `E2E_BASE_URL`); add `grepInvert: /@visual/` to the host-run `ci`, `pixel-7` and `iphone-14` projects, so every test calling `toHaveScreenshot` (tagged `@visual`) runs only in the pinned image (FR-018); add a unit check in `tests/e2e/fixtures/visual-tag.test.ts` that fails when any `*.spec.ts` contains `toHaveScreenshot` inside a test whose title lacks `@visual`
- [x] T006 [P] Add `.github/workflows/update-snapshots.yml` (`workflow_dispatch`): bring up the compose stack on the runner, read the pinned version from `tests/e2e/package.json`, run `docker run --rm --network host -v "$PWD:/work" -w /work/tests/e2e -e E2E_BASE_URL=http://localhost:5173 mcr.microsoft.com/playwright:v<version>-noble npx playwright test --project=visual --update-snapshots` plus `screenshots.spec.ts` (from T050, once it exists), and upload every `tests/e2e/tests/*.spec.ts-snapshots/` directory and `apps/landing/public/screenshots/` as one artifact; document the download-and-commit step and the local Docker Desktop equivalent (`host.docker.internal`) in `docs/runbooks/visual-snapshots.md`
- [x] T007 Add a `visual` job to `.github/workflows/ci.yml` that reuses the e2e job's compose setup and runs the same `docker run … --project=visual` command (without `--update-snapshots`), uploading the Playwright report on failure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: plan Slice A0 (the "before" baselines, merged before any token change), then the token contract, the refreshed and promoted blocks with stories, the dev-only catalogue over fixtures, and the tests that keep them honest. No screen changes its look in this phase.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete; T008–T010 merge to `main` before T014.

### Slice A0: baselines (merge first)

- [x] T008 [P] Write `tests/e2e/fixtures/journey.ts`: `startJourney(page)` returning a counter that wraps `page.click`, `page.tap`, `locator.click`, `locator.tap` (one tap each), `page.keyboard.press` and `locator.press` (one keystroke each), `locator.fill(text)` and `page.keyboard.type(text)` (`text.length` keystrokes), and counts one screen per change of `new URL(page.url()).pathname` observed on `framenavigated` (sheets and dialogs never count); `counts()` returns `{ taps, keystrokes, screens }` (spec FR-010, research R13)
- [x] T009 Write `tests/e2e/tests/journeys.spec.ts` (ci) driving the five core journeys keyboard-only through `journey.ts`, keys `sign-in`, `add-expense-foreign`, `change-month`, `edit-budget`, `open-settings` (spec US2 independent test), each asserting a visible `:focus-visible` outline at every stop; when `JOURNEY_RECORD=1` it writes `tests/e2e/fixtures/journey-baseline.json`, otherwise it asserts each count `<=` the baseline entry; run it on current `main` with `JOURNEY_RECORD=1` and commit the baseline file
- [x] T010 [P] Move `tests/e2e/tests/year.spec.ts` onto FR-018: tag its two snapshot tests `@visual` (their functional assertions move into untagged tests so they keep running in `ci`), delete the per-call `maxDiffPixels` options, keep each screenshot viewport-sized (no `fullPage`), capture anything below the first viewport as element snapshots of its panel, and re-render its baselines in the pinned image (T006 runbook); note in the commit that spec 001's T100 tolerances are overridden by spec 004 FR-018

**Checkpoint A0**: `journeys.spec.ts` green against its fresh baseline, `visual` job green on `year.spec.ts`; merge this branch before any token change.

### Tests (write first, watch them fail)

- [x] T011 [P] Write failing unit tests in `packages/ui/src/tokens.test.ts`: every name in contracts/tokens.md §Names is defined on bare `:root` and every colour and shadow token is redefined in both dark blocks; every contrast pair in contracts/tokens.md §Contrast pairs meets its ratio in both themes using the existing `contrastRatio` from `packages/ui/src/contrast.ts`; the `prefers-reduced-motion` block sets the three durations to `0ms` and no `--motion-*` exceeds 300 ms; the drift scan of `apps/web/src`, `apps/landing/src` and `packages/ui/src/components` per contracts/tokens.md §Consumption rules reports file and line, skips files listed in `packages/ui/src/drift-pending.json` (treated as `[]` when the file is absent), and fails when a listed file is already clean (research R12); every `.vue` in `packages/ui/src/components` and `packages/ui/src/charts` has a sibling `.story.ts` with at least one variant and one state
- [x] T012 [P] Write a failing build test `apps/web/src/catalogue/catalogue-bundle.test.ts` (picked up by `apps/web`'s existing Vitest include): `vite build` with `VITE_UI_CATALOGUE` unset produces no chunk whose name contains `catalogue` or `proposed-tokens` and `dist/index.html` references none; with it set to `true` the catalogue chunk exists
- [x] T013 [P] Write failing Playwright test `tests/e2e/tests/visual.spec.ts` (every test tagged `@visual`): for each story under `packages/ui/src/components/*.story.ts` and `packages/ui/src/charts/*.story.ts`, open `/__ui#<block>` at 360 × 800 and 1280 × 800 with `data-theme` light then dark and take an element snapshot of each block section (never `fullPage`); `axeCheck` in both themes; assert no request to `/api` was made while the catalogue was open

### Implementation

- [x] T014 Extend `packages/ui/src/tokens.css` with every token in contracts/tokens.md (type scale with line heights and tracking, spacing on a 4 px base, radii, elevation, the twelve colour roles, motion durations and easings, layout tokens `--target-min`, `--content-max`, `--gutter`), defined on `:root`, every colour and shadow redefined in the two existing dark blocks, plus `@media (prefers-reduced-motion: reduce)` zeroing the durations; existing token values are kept (the direction changes them in T028)
- [x] T015 Seed `packages/ui/src/drift-pending.json`: run the T011 drift scan once with an empty list, write every offending path as a sorted array, and commit it (data-model.md §Drift pending list); from here every change may only remove entries
- [x] T016 [P] Create the story helper `packages/ui/src/stories.ts` (`defineStory({ title, variants, states, usage? })` and `collectStories()` via `import.meta.glob` over `./components/*.story.ts` and `./charts/*.story.ts`) and export it from `packages/ui/src/index.ts`
- [x] T017 [P] Control blocks in `packages/ui/src/components/` per contracts/blocks.md: refresh `Button.vue`, `Input.vue`, `Select.vue`; add `Tabs.vue`, `MenuButton.vue`, `ThemeToggle.vue` (presentation only; it calls the existing `packages/ui/src/theme.ts`), `Kbd.vue`; `:focus-visible` ring from `--color-focus`, `--target-min` on phone, ARIA per the inventory, tokens only; a `.story.ts` beside each; export the new ones from `packages/ui/src/index.ts`
- [x] T018 [P] Surface blocks in `packages/ui/src/components/` per contracts/blocks.md: give `Dialog.vue` a `placement` prop (`center`, `bottom` on phone, `side` on desktop; `role="dialog"`, `aria-modal`, focus trap, Esc closes, focus returns) without renaming it, and refresh `Toast.vue` (roles, undo, 6 s dismiss paused on hover and focus), `Skeleton.vue`, `EmptyState.vue`, `ErrorState.vue`; motion through `<Transition>` and the motion tokens only; a `.story.ts` beside each
- [x] T019 Promote blocks into `packages/ui/src/components/`: `PanelFrame.vue` merging `apps/web/src/components/PanelState.vue` and `apps/web/src/components/widgets/WidgetFrame.vue` (loading, empty, error with `causeMessages`, `role="region"` + `aria-labelledby`), `Tile.vue` from the presentational part of `apps/web/src/components/ForecastTile.vue`, and move `packages/ui/src/charts/DataTable.vue` to `packages/ui/src/components/DataTable.vue` (`<caption>`, sortable headers with `aria-sort`, `dense` variant, tabular figures); port `PanelState.test.ts` and `WidgetFrame.test.ts` to `packages/ui/src/components/`; switch every caller's import (the 12 `PanelState` users, `WidgetStrip.vue`, `MonthView.vue`, every `DataTable` user) without changing their markup; delete the old files; a `.story.ts` beside each block
- [x] T020 [P] Restyle the hand-written charts `packages/ui/src/charts/CategoryBars.vue`, `TrendSparkline.vue`, `YearBars.vue` on the tokens (single hue from `--color-accent`, over-budget fill from `--color-critical`, budget ticks from `--color-border`; status colours never as series), SVG implementation unchanged, table fallback kept; a `.story.ts` beside each
- [x] T021 Build the catalogue: `apps/web/src/catalogue/fixtures.ts` (synthetic user `GBP`/`Europe/London`/`system`, one month of about thirty expenses, three budgets with one over, the panel error causes, and the edge fixture: a 48-character category name, a six-digit amount, a day with thirty entries; data-model.md §Catalogue fixtures), `apps/web/src/catalogue/CatalogueView.vue` (every story's variants × states in a light and a dark column, anchor per block, theme forced per column via `data-theme` on a wrapper), mounted at `/__ui` in `apps/web/src/router.ts` as a lazy route only when `import.meta.env.VITE_UI_CATALOGUE === 'true'`; no store or API import anywhere under `apps/web/src/catalogue/`

**Checkpoint**: `pnpm test:unit` green (tokens, contrast, drift ratchet, stories, bundle); the `visual` job green on `/__ui` with baselines rendered in the pinned image; `/__ui` renders every block in both themes on the preview URL with axe clean; no screen's look has changed.

---

## Phase 3: User Story 1 - A written design direction to build against (Priority: P1) 🎯 MVP

**Goal**: `docs/design/DESIGN.md` with at most three references, the decisions table, scales, motion rules, block conventions, taste dials and four coded mock-ups; ADR-0006 proposing the identity with the refinement fallback; the owner approves one of the two (plan Slice A).

**Independent Test**: the owner reads the document and the mock-ups in under fifteen minutes and can say which references were chosen, why, and what changes on the month view; four of five people outside the project shown the before/after mock-ups pick the "after" (SC-002, `needs-rostom`).

### Tests (write first, watch them fail)

- [ ] T022 [P] [US1] Write a failing unit test `packages/ui/src/design-doc.test.ts`: `docs/design/DESIGN.md` contains the ten sections of data-model.md §Design direction in order, names at most three references each with a licence line and a file under `docs/design/references/`, and its decisions table has one row per CLAUDE.md design-system decision valued `kept`, `adjusted` or `replaced`
- [ ] T023 [P] [US1] Extend `tests/e2e/tests/visual.spec.ts`: `/__ui/mockups/month-view`, `/__ui/mockups/add-expense`, `/__ui/mockups/settings` and `/__ui/mockups/month-view-fallback` at 360 × 800 and 1280 × 800 in both themes, each also with `?state=loading|empty|error`, and the month view with `?fixture=edge` (long name truncated with its full value in the accessible name, six-digit amount inside its tile, thirty-entry day keeps table alignment, no horizontal overflow); viewport snapshots plus element snapshots of panels below the fold; axe in both themes; the month-view mock-up's primary tile figure has the largest computed font size on the page (FR-011)

### Implementation

- [ ] T024 [US1] `needs-rostom` for the init step. Run `/impeccable init` with the owner (audience, use case, brand personality) and keep its context file out of git unless the owner wants it committed; run the `impeccable` critique and `redesign-existing-projects` audit on the current month view, add-expense sheet and settings (at 360 and 1280 wide) and `npx -y impeccable@4.1.0 detect` on those routes, saving the findings to `docs/design/BASELINE-AUDIT.md`; optionally `skillui --url` one reference site into the scratchpad for study. Then produce the reference shortlist: read the awesome-design-md DESIGN.md files for Linear, Stripe, Vercel and up to three other candidates suited to a daily finance tool on a phone (research R2), run `/ui-ux-pro-max:ui-ux-pro-max` for "finance dashboard, mobile-first, Vue" and the impeccable critique on the current screens, and write `docs/design/SHORTLIST.md` (candidates, what each offers, licence, the recommended three with reasons); copy the three chosen files to `docs/design/references/<name>.DESIGN.md` with the collection's MIT notice
- [ ] T025 [US1] Write `docs/design/DESIGN.md` per data-model.md §Design direction (character, references, decisions table, scales as final token values, motion rules informed by the Magic UI MCP's motion patterns and capped by FR-007, block conventions, taste dials (variance, motion intensity, density) chosen with `Skill: design-taste-frontend` and cross-checked against `Skill: ui-ux-pro-max:ui-ux-pro-max` mock-up links, fallback, a "Building a new panel" stub completed in T046) and `docs/adr/ADR-0006-visual-identity.md` (context, the proposed identity as the decisions table's `replaced` rows, the fallback, consequences including that the look change needs no flag per constitution v1.1.1, status Proposed)
- [ ] T026 [US1] Write the proposed values as `apps/web/src/catalogue/proposed-tokens.css`, every rule scoped under `[data-identity="proposed"]` (and its two dark counterparts, contracts/tokens.md §Theme contract) and imported only by `CatalogueView.vue` and the mock-ups, so `packages/ui/src/tokens.css` stays the one token set in the product (FR-017) and shipped screens keep the existing system until ADR-0006 is accepted (FR-016); extend `packages/ui/src/tokens.test.ts` to assert the contrast pairs for the proposed values too
- [ ] T027 [P] [US1] Build `apps/web/src/catalogue/mockups/MonthViewMock.vue`, `AddExpenseMock.vue`, `SettingsMock.vue` (inside a `data-identity="proposed"` wrapper; loading, empty, error and edge variants by query string; blocks and fixtures only) and `MonthViewFallbackMock.vue` (existing identity), mounted under `/__ui/mockups/*` in `apps/web/src/router.ts`, built with `Skill: design-taste-frontend` and `Skill: impeccable` applied and each mock-up passing `npx -y impeccable@4.1.0 detect` at both viewports with no non-advisory finding (findings and fixes listed in `docs/design/BASELINE-AUDIT.md` §Mock-ups); capture "before" screenshots of the real month view, add-expense sheet and settings into `docs/design/before/*.png` with a one-off `tests/e2e/tests/before.spec.ts` tagged `@manual`
- [ ] T028 [US1] `needs-rostom` Owner review on the preview URL (`/__ui`, `/__ui/mockups/*`, both themes, both widths): record the decision by setting ADR-0006 to Accepted or Rejected (fallback) and DESIGN.md's state line; if accepted, move the values from `proposed-tokens.css` into `packages/ui/src/tokens.css`, and if the accepted identity replaces IBM Plex Sans/Mono or the green accent, amend `.specify/memory/constitution.md` Principle VI in the same change (MINOR version bump, Sync Impact Report, "Last Amended" date, ADR-0006 as the amendment's ADR; only the owner merges it, spec FR-016) and update the "Design system" section of `CLAUDE.md`; the fallback needs no amendment; either way delete `apps/web/src/catalogue/proposed-tokens.css`, its imports and the `data-identity` wrappers, and re-render the catalogue baselines; the owner also runs SC-002 (five outsiders on the unlabeled before/after mock-ups) and the result is recorded in `docs/ROADMAP.md` (SC-001, SC-002)

**Checkpoint**: US1 independent test passes; DESIGN.md is `Approved` or `Approved-fallback`; `design-doc.test.ts` and the mock-up snapshots green; `tokens.css` holds exactly one identity.

---

## Phase 4: User Story 2 - The app screens follow the direction (Priority: P1)

**Goal**: every signed-in screen refreshed from blocks and tokens only with no workflow change: six core screens one change each, then four grouped changes (plan Slice B, spec FR-017).

**Independent Test**: on a phone and a laptop profile a user completes the five core flows; every screen passes axe, matches its snapshot, and each journey's counts stay at or under `journey-baseline.json`.

**Per-change recipe (applies to T031–T042)**: one branch `phase-4/ui-<area>`; (1) **audit first**: run `Skill: redesign-existing-projects` on the screen(s) and `npx -y impeccable@4.1.0 detect` on their files and routes at `--viewport 360x800` and `1280x800`, and paste the findings into the PR's Design tools section; (2) remove the change's files from `packages/ui/src/drift-pending.json` and add its routes to `SCREENS` in `visual.spec.ts` (both red); (3) refresh using blocks and layout-only CSS (contracts/blocks.md §Screen composition), guided by `Skill: impeccable` and `Skill: design-taste-frontend` within DESIGN.md, until the drift test, snapshots (rendered in the pinned image), axe, `journeys.spec.ts` and Lighthouse are green; (4) **review**: rerun the detector (zero non-advisory findings or each justified) and dispatch the `impeccable-finish-reviewer` agent against DESIGN.md and the approved mock-up, fixing every material item it returns or recording why not; name every intended snapshot change in the PR description; flagged screens are tested with their flags on (`panels.*` from `ci.yml`, `enableWidgetFlags()` for `widgets.*`) and no flag changes state.

### Tests (write first, watch them fail)

- [ ] T029 [P] [US2] Add the screen harness to `tests/e2e/tests/visual.spec.ts` (tests tagged `@visual`): a `SCREENS` table (route, seed step, optional flag setup, panels below the fold) that each per-screen change appends to; for each entry at 360 × 800 and 1280 × 800 in both themes take a viewport snapshot plus element snapshots of panels below the fold, force loading, empty and error states through the mocks and a `?state=` query honoured only when `VITE_UI_CATALOGUE === 'true'`, run `axeCheck` with the WCAG 2.2 `target-size` rule, assert every focusable element is ≥ 44 px at 360 wide and ≥ 24 px at 1280 wide (32 px inside `DataTable` dense rows and `MenuButton` menus), and under reduce-motion emulation assert no element has a non-zero computed `transition-duration`
- [ ] T030 [P] [US2] Measure the app signed in: add `tests/e2e/lighthouse-session.sh`, which signs up and verifies a seeded user against the compose API with `curl` (the same steps as `signUpAndVerify` in `tests/e2e/fixtures/index.ts`) and prints the session cookie; in the `lighthouse` step of `.github/workflows/ci.yml` pass it to `lhci autorun --collect.settings.extraHeaders='{"Cookie":"<cookie>"}'`; add `http://localhost:5174/settings` to `tests/e2e/lighthouserc.json` next to `/` and the landing URL (today `/` redirects to sign-in, so this is the first real measurement of the month view); keep performance ≥ 0.9 and accessibility ≥ 0.95 on the mobile preset; no new dependency (no Puppeteer script)

### Implementation

- [ ] T031 [US2] Refresh the shell `apps/web/src/App.vue` (header, navigation, `FeedbackWidget.vue`, theme attribute handling) with the tokens and blocks so the half-refreshed product shares one header from the first screen change onward; remove `App.vue` and `components/FeedbackWidget.vue` from `drift-pending.json`
- [ ] T032 [US2] B1 month view: refresh `apps/web/src/views/MonthView.vue` from `Tile`, `PanelFrame`, `DataTable`, `Tabs` and the restyled charts, desktop layout per FR-008 (from 1024 px: centred in `--content-max`, tiles in one row, category bars and entries table side by side), `apps/web/src/components/ForecastTile.vue` reduced to data wiring around `Tile`; `SCREENS` entry `/` with the edge fixture seeded; `change-month` journey at or under baseline
- [ ] T033 [US2] B2 add expense: refresh `apps/web/src/views/AddView.vue`, `apps/web/src/components/ExpenseForm.vue` (inside `Dialog` `placement="bottom"`/`"side"`), `components/CurrencyPicker.vue` and `components/VersionHistory.vue` with `Input` (`amount` variant), `Select`, `Button` and the `Toast` undo, field order and shortcuts unchanged; `SCREENS` entries `/add` and the sheet opened from `/`; `add-expense-foreign` journey at or under baseline
- [ ] T034 [US2] B3 categories: refresh `apps/web/src/views/CategoriesView.vue` (`DataTable` dense on desktop, budget editor in `Dialog`, over-budget rows in `--color-critical`) and `apps/web/src/views/CategoryView.vue`; `SCREENS` entries `/settings/categories` and `/settings/categories/:id`; `edit-budget` journey at or under baseline
- [ ] T035 [US2] B4 settings: refresh `apps/web/src/views/SettingsView.vue` (`Tabs` sections, `ThemeToggle`, forms from `Input`, `Select`, `Button`); `SCREENS` entry `/settings`; `open-settings` journey at or under baseline
- [ ] T036 [US2] B5 sign-in: refresh `apps/web/src/views/LoginView.vue` from `Input` and `Button`, single column at every width, errors through `ErrorState`; `SCREENS` entry `/login`; `sign-in` journey at or under baseline
- [ ] T037 [US2] B6 Today: refresh `apps/web/src/views/TodayView.vue` and `apps/web/src/components/today/CalendarPanel.vue`, `InboxPanel.vue`, `AccountChip.vue` on `PanelFrame` (offline, loading, empty, error states kept); `SCREENS` entry `/today` with the `panels.*` flags on and mocked providers from `mockProvider`
- [ ] T038 [US2] `needs-rostom` After T037 merges, the owner runs the SC-003 screen-reader pass on the preview deployment: the five core journeys completed keyboard-only with NVDA on Windows and VoiceOver on iPhone; record date, tools and pass/fail per journey in `docs/ROADMAP.md`
- [ ] T039 [US2] B7 account screens: refresh `apps/web/src/views/RegisterView.vue`, `VerifyView.vue`, `ForgotView.vue`, `ResetView.vue`, `OnboardingView.vue` from `Input`, `Button`, `ErrorState` (expired and used links through `ErrorState`); `SCREENS` entries for each route; `HelloView.vue` is not routed (checked 2026-10-04), so it is left in `drift-pending.json` and raised with the owner as a deletion candidate rather than refreshed
- [ ] T040 [US2] B8 data screens: refresh `apps/web/src/views/YearView.vue` (with `components/MonthCompare.vue` on `PanelFrame`), `ImportView.vue`, `BinView.vue`; move the `year.spec.ts` snapshots into `SCREENS` entries for `/year`, `/import`, `/bin` and re-render them
- [ ] T041 [US2] B9 settings sub-screens: refresh `apps/web/src/views/CaptureView.vue`, `ConnectorsView.vue`, `ConnectionsView.vue` and `apps/web/src/components/connections/StandardsForm.vue`; `SCREENS` entries `/settings/capture`, `/settings/connectors`, `/settings/connections`
- [ ] T042 [US2] B10 widgets: refresh every file in `apps/web/src/components/widgets/` (`WidgetStrip`, the seven widgets, `AddWidgetSheet`, `WidgetSettingsSheet`, `PlacePicker`, `CurrencyPicker`, `SunriseSettings`, `WeatherSettings`) on `PanelFrame`, `Tile` and `Dialog`; `SCREENS` entries for the strip on `/` and `/today` and both sheets open, with `enableWidgetFlags()` and `mockOpenMeteo()`; afterwards `drift-pending.json` holds only `apps/landing` paths and `HelloView.vue`

**Checkpoint**: US2 independent test passes; every `journeys.spec.ts` count at or under the baseline; Lighthouse green on `/` and `/settings`; T038 recorded or explicitly pending.

---

## Phase 5: User Story 3 - Reusable building blocks (Priority: P2)

**Goal**: the catalogue documents every block with variants, states and a usage example, the drift and inventory checks make the set self-enforcing, and a contributor can build a new panel from blocks alone in under thirty minutes (plan Slice C).

**Independent Test**: a contributor builds a panel with title, list, loading and empty states from the documented blocks in under thirty minutes and it passes the visual and accessibility checks without further styling.

### Tests (write first, watch them fail)

- [ ] T043 [P] [US3] Extend `packages/ui/src/tokens.test.ts`: every block in contracts/blocks.md §Inventory exists in `packages/ui/src/components` with a story whose variants and states match the inventory columns, every chart has a story, and every story has a non-empty `usage` string
- [ ] T044 [P] [US3] Extend `tests/e2e/tests/visual.spec.ts`: each story's `usage` example renders in the catalogue as a live cell plus its source in a `<pre>`, element-snapshotted at both widths in both themes

### Implementation

- [ ] T045 [US3] Add `usage` to every `packages/ui/src/components/*.story.ts` and `packages/ui/src/charts/*.story.ts`, render it in `apps/web/src/catalogue/CatalogueView.vue` (live example, source block, jump links), and add a catalogue index listing each block with its purpose from the inventory
- [ ] T046 [US3] Complete `docs/design/DESIGN.md` §Building a new panel (pick `PanelFrame`, choose states, wire `causeMessages`, add a story, run the tests)
- [ ] T047 [US3] Run the contributor exercise from quickstart.md Slice C with a throw-away `apps/web/src/components/DemoPanel.vue` built from blocks only, its snapshot and axe cases passing first time; record the time in DESIGN.md §Building a new panel, then delete the file; the timed run with a person other than the agent is SC-006 and `needs-rostom`, recorded in `docs/ROADMAP.md`

**Checkpoint**: US3 independent test passes; the inventory check and drift ratchet run in `pnpm test:unit`.

---

## Phase 6: User Story 4 - The landing page shares the direction (Priority: P3)

**Goal**: the landing page on the same tokens with generated screenshots and the three-step explanation above the fold on a phone (plan Slice D); publication (`LANDING_ENABLED`) waits for the product name (ADR-0002).

**Independent Test**: three people outside the project open the landing page on their phones, describe the product in one sentence and find sign-up without help (SC-008, `needs-rostom`); the screenshots match the refreshed app screens.

### Tests (write first, watch them fail)

- [ ] T048 [P] [US4] Extend `tests/e2e/tests/landing.spec.ts`: at 360 × 800 the headline, three steps and sign-up action are inside the first viewport with no horizontal scroll; viewport snapshots at both widths in both themes in separate tests tagged `@visual`; axe in both themes; every `<img>` under `/screenshots/` resolves to a file listed in `apps/landing/public/screenshots/manifest.json` with `generatedBy: "screenshots.spec.ts"`
- [ ] T049 [P] [US4] Remove every `apps/landing/src` path from `packages/ui/src/drift-pending.json` (drift test now red on the landing files)

### Implementation

- [ ] T050 [P] [US4] Write `tests/e2e/tests/screenshots.spec.ts` (tagged `@screenshots`, run by `update-snapshots.yml`): sign in as a seeded test user, render `/` and the add-expense sheet at 360 wide in light and dark, write `apps/landing/public/screenshots/{month,add}-{light,dark}.png` and `manifest.json`
- [ ] T051 [US4] Apply the tokens and blocks to `apps/landing/src/App.vue`, `pages/index.vue`, `pages/privacy.vue`, `pages/terms.vue` (shared `packages/ui` tokens, `Button` for sign-up, the three steps above the fold, `<picture>` switching the light and dark screenshots on `prefers-color-scheme`), the working name still read from `apps/landing/src/content.ts`, applying `Skill: design-taste-frontend` (its landing-page guidance, limited by FR-007 and DESIGN.md) and `Skill: impeccable`, with `npx -y impeccable@4.1.0 detect` clean on the built page at both viewports and an `impeccable-finish-reviewer` pass; once the drift test is green delete `packages/ui/src/drift-pending.json` if only `HelloView.vue` remains and the owner has decided its fate (SC-007); do not set `LANDING_ENABLED`

**Checkpoint**: US4 independent test passes in ci; the landing page stays unpublished until the owner sets `LANDING_ENABLED` after the name decision.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: docs, the people-based results, and the final run.

- [ ] T052 [P] Dispatch the `impeccable-documenter` agent to reconcile `docs/design/DESIGN.md` with the shipped screens (derived from what was built, not from intentions) and review its diff before committing; replace the "Design system" section of `CLAUDE.md` with a pointer to `docs/design/DESIGN.md` plus the four rules that survive regardless (three theme states, status colours never as chart series, hand-written charts, no new runtime dependency); add ADR-0006 to Key documents; add the slices and the `needs-rostom` rows (SC-002, SC-003, SC-006, SC-008) to `docs/ROADMAP.md`; confirm every change added its `CHANGELOG.md` line
- [ ] T053 Run quickstart.md end to end on the compose stack (`pnpm lint && pnpm typecheck && pnpm test:unit && pnpm worker:build && pnpm test:e2e -- --project=ci`, then the `visual` project in the pinned image), confirm zero unexplained pixel diffs, `npx -y impeccable@4.1.0 detect` clean on every refreshed route at both viewports, every UI change's PR or commit carrying its Design tools section, coverage on `packages/core` and `apps/api` unchanged, no new dependency in any `package.json`, and `drift-pending.json` gone or holding only owner-pending entries; the feature is called done only when `docs/ROADMAP.md` records SC-002, SC-003, SC-006 and SC-008

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first; T002–T006 in parallel after it (T002 owner-gated, does not block code); T007 after T005 and T006
- **Foundational (Phase 2)**: T008 and T010 in parallel, T009 after T008; **A0 (T008–T010) merges before T014**. Then T011–T013 (tests) in parallel; T014 → T015; T016 in parallel with T014; T017, T018, T020 in parallel after T016; T019 after T017 and T018; T021 after T019 and T020
- **US1 (Phase 3)**: after Phase 2. T022 and T023 in parallel; T024 → T025 → T026; T027 after T025, in parallel with T026; T028 last and owner-gated
- **US2 (Phase 4)**: after T028 (direction approved or fallback chosen). T029 and T030 in parallel first; T031 first among screens; then T032 → T033 → T034 → T035 → T036 → T037 in order (one change each); T038 after T037 (owner, non-blocking); T039–T042 after T037, in any order, one change each
- **US3 (Phase 5)**: after Phase 2; T043 and T044 in parallel; T045 → T046 → T047; may run alongside US2 provided story edits do not touch screen files
- **US4 (Phase 6)**: after T032 and T033 (screenshots need the refreshed month view and add-expense sheet); T048–T050 in parallel; T051 last
- **Polish (Phase 7)**: T052 after US4; T053 last

### User Story Dependencies

- **US1 (P1)**: needs only Phase 2 → MVP (direction and mock-ups are the first reviewable deliverable)
- **US2 (P1)**: needs US1 approved (ADR-0006 accepted or fallback chosen)
- **US3 (P2)**: needs only Phase 2
- **US4 (P3)**: needs US2's B1 and B2; publication waits for ADR-0002 and the owner's `LANDING_ENABLED`

### Within Each User Story

- Tests are written and fail before implementation; the PR shows the test before the change
- Tokens → blocks and stories → catalogue → screens; screens hold layout-only CSS
- Each screen change removes its files from `drift-pending.json`; the list never grows
- Journey counts never rise, except for an unavoidable WCAG 2.2 AA step raised in the baseline in the same change with the reason and the owner's approval (FR-010)
- Every snapshot change is named in the PR description; baselines come only from the pinned image

### Parallel Opportunities

- Setup: T002–T006
- A0: T008 and T010
- Phase 2 tests T011–T013 (three files); blocks T017, T018, T020 (disjoint files)
- US1: T022 and T023; T026 and T027
- US2: T029 and T030; after T037 the four grouped changes T039–T042 touch disjoint files
- US3: T043 and T044, and the whole story alongside US2
- US4: T048, T049, T050

---

## Parallel Example: Phase 2

```bash
# Slice A0, merged first:
Task: "Journey counter in tests/e2e/fixtures/journey.ts"
Task: "year.spec.ts onto FR-018 in tests/e2e/tests/year.spec.ts"

# Tests first, in parallel (three files):
Task: "Token, contrast, drift-ratchet and story tests in packages/ui/src/tokens.test.ts"
Task: "Bundle test in apps/web/src/catalogue/catalogue-bundle.test.ts"
Task: "Catalogue snapshots and axe in tests/e2e/tests/visual.spec.ts"

# Then blocks in parallel after tokens.css and stories.ts:
Task: "control blocks (T017)"   Task: "surface blocks (T018)"   Task: "charts (T020)"
```

## Parallel Example: User Story 2 (after T037)

```bash
Task: "B7 account screens (T039)"
Task: "B8 data screens (T040)"
Task: "B9 settings sub-screens (T041)"
Task: "B10 widgets (T042)"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + US1)

1. Phase 1 setup and Slice A0 baselines (merged before anything changes)
2. Phase 2 tokens, blocks, catalogue
3. US1 direction, ADR-0006 and the four coded mock-ups on the preview URL
4. **STOP and VALIDATE**: the owner approves the direction or picks the fallback (SC-001) and runs SC-002

### Incremental Delivery

1. A0 → baselines; Slice A (Phase 2 + US1) → approved direction, tokens and blocks in the catalogue only
2. Slice B (US2) → shell, then six core screens one change each, then four grouped changes
3. Slice C (US3) → catalogue complete, self-enforcing checks
4. Slice D (US4) → landing page, unpublished until the name decision

### Parallel Team Strategy

One developer working evenings (constitution rationale): follow the slice order. With the coordinator and implementer agents (CLAUDE.md model routing), US3 can run alongside US2, and T039–T042 can run as four parallel briefs.

---

## Carry-forward from Phases 1–2 (recorded 2026-10-05)

- **T028**: dark `--color-critical` (#a83a2e, ~2.8:1) fails AA; kept unchanged because Phase 2 is look-neutral. `tokens.test.ts` asserts the gap (turns red once fixed) and `visual.spec.ts` skips colour contrast only in the dark column of Button, ErrorState, Input, Select, PanelFrame (`DARK_CRITICAL_GAP_T028`); remove both when the value changes. The contract pair `--color-focus` on `--color-accent` (3:1) is unreachable with today's accents and is left out of `tokens.test.ts`; resolve it in the direction. New colour roles (surface, border, focus, selection, shadows) hold provisional values.
- **T031–T042**: Button, Input, Select, Dialog, Toast, EmptyState, ErrorState, PanelFrame, Tile and DataTable stay in `drift-pending.json` because their off-scale literals (0.9rem, 0.85rem, 0.8rem, 0.6rem, 6px radius, rgb scrims and shadows) cannot become tokens without a visible change; they leave the list in the screen change that first restyles them. `--target-min` was not applied to existing blocks (D1); it arrives per screen. `redesign-existing-projects` suggestions are in the T017, T018 and T020 commit bodies.
- **T033**: `journeys.spec.ts` exempts `input[type=date]` from the focus-ring assertion (Chromium shows a segment highlight, computed outline none); give it a real ring and drop the exemption.
- **T042**: `PanelFrame` (packages/ui) carries widget-specific copy and a `RouterLink` merged from `WidgetFrame`; move that content back into `apps/web` when the widgets are refreshed.
- **T045**: Dialog and Toast render as placeholders in the catalogue (teleported, fixed position); give them an inline catalogue mode. At 360 px the half-width dark column occludes the DataTable "Budgeted" header (impeccable detect, text-occlusion).
- **Flakiness**: the `Input light mobile` catalogue snapshot failed once in 90 and passed 10/10 on repeat; the web unit suite times out under parallel agent load but passes alone (CLAUDE.md known issue).

## Notes

- [P] tasks touch different files and depend on nothing incomplete
- Never push, open a PR or merge without Rostom's explicit instruction; commit locally per task
- Every change: test shown before change, `CHANGELOG.md` line, coverage not lower, Lighthouse green where a page changed, snapshot changes named, `worker-build` green
- No new dependency, runtime or dev; `@playwright/test` is pinned, not added. The six tools live in the owner's Claude Code configuration and the scratchpad and are run through `Skill`, `npx -y impeccable@4.1.0`, agents and MCP, never through `package.json`; what is committed from them is the three reference DESIGN.md files with their MIT notice, `docs/design/TOOLS.md` and `docs/design/BASELINE-AUDIT.md`
- Coordinator briefs for any UI task name the design tools to run (per §Design tools in use); the implementer and coordinator agents have the `Skill` tool for this
- `apps/web/src/catalogue/proposed-tokens.css` (T026) exists only between the mock-ups and the ADR-0006 decision and is deleted in T028 either way
- Open for the owner: `HelloView.vue` is not routed; delete it or route it (T039, T051)
- Two `CurrencyPicker.vue` files exist (`components/` and `components/widgets/`); T033 and T042 refresh each in place and do not merge them (out of scope)
