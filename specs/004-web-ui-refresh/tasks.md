# Tasks: Web UI Refresh

**Input**: Design documents from `/specs/004-web-ui-refresh/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tokens.md, contracts/blocks.md, quickstart.md
**Generated**: 2026-09-17

**Tests**: included and mandatory. The constitution (Principle I) requires every behaviour change to start with a failing test, so each phase lists its tests before its implementation and `/speckit-implement` must run them red first. Snapshot baselines are produced only by the `update-snapshots` workflow (research R6), never locally.

**Baseline dependency**: starts at the top of roadmap Phase 4 (spec FR-017): the month view, add-expense flow, categories with budgets and settings from `specs/001-phased-product-baseline/tasks.md` exist, as do `packages/ui/src/tokens.css`, the base components from baseline T027, `PanelState.vue`, `tests/e2e/fixtures/index.ts` (`axeCheck`), `tests/e2e/lighthouserc.json` and the `apps/landing` scaffold (baseline T106, needed by US4 only).

**Organization**: phases follow spec priority (US1 direction, US2 screens, US3 blocks, US4 landing). Foundational carries the token extension, the refreshed blocks and the catalogue route because the mock-ups (US1) are built from them and every later story consumes them (plan Slice A minus the direction document). Nothing in `apps/api` or `packages/core` is touched.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (direction), US2 (screens), US3 (blocks), US4 (landing)
- Every task names its file(s); paths are repository-relative

## Path Conventions

Monorepo per plan.md: `packages/ui/src`, `apps/web/src`, `apps/landing/src`, `tests/e2e/tests`, `docs/design`, `docs/adr`, `.github/workflows`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the planning set committed, the owner's design tools installed, the catalogue build switch and the snapshot workflow.

- [ ] T001 Commit the planning set (`specs/004-web-ui-refresh/**`) on the current branch so the delivery branch starts from it
- [ ] T002 With the owner present, run the tool setup from research R11: `npx impeccable install` then `/impeccable init`; `npx skills add https://github.com/Leonxlnx/taste-skill`; `git clone https://github.com/VoltAgent/awesome-design-md` into the scratch directory (outside the repo); optionally `npm install -g skillui`; the owner adds the Magic UI MCP if wanted; record what was installed and where in `docs/design/TOOLS.md` (one line per tool, no output committed)
- [ ] T003 [P] Add `VITE_UI_CATALOGUE` to `.env.example` (comment: `true` on dev and preview only), set it in the `web` service of `infra/docker-compose.yml`, in the preview build step of `.github/workflows/deploy-preview.yml`, and leave it unset in `.github/workflows/deploy-staging.yml`
- [ ] T004 [P] Add `.github/workflows/update-snapshots.yml` (`workflow_dispatch`; brings up the compose stack, runs `pnpm test:e2e -- --project=ci --update-snapshots` for `visual.spec.ts` and `screenshots.spec.ts`, uploads `tests/e2e/tests/visual.spec.ts-snapshots/` and `apps/landing/public/screenshots/` as one artifact) and document the download-and-commit step in `docs/runbooks/visual-snapshots.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the token contract in `tokens.css`, the refreshed blocks with stories, the dev-only catalogue route over fixtures, and the tests that keep all three honest. No screen changes yet.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests (write first, watch them fail)

- [ ] T005 [P] Write failing unit tests in `packages/ui/src/tokens.test.ts`: every name in contracts/tokens.md §Names is defined on `:root` and, for colour tokens, in both dark blocks; every contrast pair in contracts/tokens.md meets its ratio in both themes (parse the CSS values, compute WCAG relative luminance in the test); the `prefers-reduced-motion` block sets the three durations to `0ms` and every `--motion-*` duration is ≤ 300 ms; a drift scan of `apps/web/src` and `packages/ui/src/components` finds no hex/`rgb()`/`hsl()` colour, no `px`/`rem` `font-size`, `margin`, `padding`, `gap` or `transition-duration` literal outside the allow-list, reporting file and line; every `.vue` in `packages/ui/src/components` has a sibling `.story.ts` listing at least one variant and one state
- [ ] T006 [P] Write a failing build test `apps/web/test/catalogue-bundle.test.ts`: `vite build` with `VITE_UI_CATALOGUE` unset produces no chunk whose name contains `catalogue` and `dist/index.html` references none; with it set to `true` the chunk exists
- [ ] T007 [P] Write failing Playwright test `tests/e2e/tests/visual.spec.ts` (ci): for each story exported by `packages/ui/src/components/*.story.ts`, open `/__ui#<block>` at 360 × 800 and 1280 × 800 with `data-theme` light then dark, disable animations, and `toHaveScreenshot` with `maxDiffPixelRatio: 0.002`; `axeCheck` on the page in both themes; assert no network request to `/api` was made while the catalogue was open

### Implementation

- [ ] T008 Extend `packages/ui/src/tokens.css` with every token in contracts/tokens.md (type scale with line heights, spacing on a 4 px base, radii, elevation, colour roles, motion durations and easings, layout tokens), defined on `:root` and redefined in the two existing dark blocks for every colour and shadow, plus `@media (prefers-reduced-motion: reduce)` zeroing the durations; keep the current values for the existing tokens (the direction changes them later)
- [ ] T009 [P] Create the story convention `packages/ui/src/stories.ts` (`defineStory({ title, variants, states })` type helper and `collectStories()` via `import.meta.glob('./components/*.story.ts')`) and export it from `packages/ui/src/index.ts`
- [ ] T010 [P] Refresh the control blocks in `packages/ui/src/components/`: `Button.vue`, `Input.vue`, `Select.vue`, `Tabs.vue`, `MenuButton.vue`, `ThemeToggle.vue`, `Kbd.vue` per contracts/blocks.md (variants, states, `:focus-visible` ring from `--color-focus`, `--target-min` on phone, ARIA per the inventory, tokens only) with a `.story.ts` beside each
- [ ] T011 [P] Refresh the surface blocks in `packages/ui/src/components/`: `Sheet.vue` (bottom on phone, side on desktop, `role="dialog"`, focus trap, Esc, focus return), `Toast.vue` (roles, undo, 6 s pause on hover/focus), `PanelFrame.vue` (wraps `PanelState.vue` for loading/empty/error with `causeMessages`), `Skeleton.vue`, `EmptyState.vue`, `ErrorState.vue`, `Tile.vue`, `DataTable.vue` (`<caption>`, `aria-sort`, tabular figures) per contracts/blocks.md, with a `.story.ts` beside each; motion via `<Transition>` and the motion tokens only
- [ ] T012 Build the catalogue: `apps/web/src/catalogue/fixtures.ts` (synthetic user, month, categories, budgets and error causes per data-model.md §Catalogue fixtures), `apps/web/src/catalogue/CatalogueView.vue` (every story's variants × states in a light and a dark column, anchor per block, theme forced per column with `data-theme` on a wrapper), and mount it at `/__ui` in `apps/web/src/router.ts` only when `import.meta.env.VITE_UI_CATALOGUE === 'true'` as a lazy route; no store or API import anywhere under `catalogue/`

**Checkpoint**: `pnpm test:unit` green (tokens, contrast, drift, stories), bundle test green, `/__ui` renders every block in both themes on the preview URL with axe clean; snapshot baselines produced by the `update-snapshots` workflow and committed.

---

## Phase 3: User Story 1 - A written design direction to build against (Priority: P1) 🎯 MVP

**Goal**: `docs/design/DESIGN.md` with at most three references, the decisions table, scales, motion rules, block conventions, taste dials and coded mock-ups; ADR-0006 proposing the identity with the refinement fallback; the owner approves one of the two (plan Slice A).

**Independent Test**: the owner reads the document and the mock-ups in under fifteen minutes and can say which references were chosen, why, and what changes on the month view; two people outside the project shown the before/after mock-ups pick the "after".

### Tests (write first, watch them fail)

- [ ] T013 [P] [US1] Write a failing unit test `packages/ui/src/design-doc.test.ts`: `docs/design/DESIGN.md` contains the ten sections of data-model.md §Design direction in order, names at most three references each with a licence line and a file under `docs/design/references/`, and its decisions table has one row per CLAUDE.md design-system decision with a value from `kept | adjusted | replaced`
- [ ] T014 [P] [US1] Extend `tests/e2e/tests/visual.spec.ts` (ci): `/__ui/mockups/month-view`, `/__ui/mockups/add-expense`, `/__ui/mockups/settings` and `/__ui/mockups/month-view-fallback` at 2 × 2, each also with `?state=loading|empty|error`, with axe in both themes; the month-view mock-up's primary tile figure has the largest computed font size on the page (FR-011)

### Implementation

- [ ] T015 [US1] Produce the reference shortlist: read the awesome-design-md DESIGN.md files for Linear, Stripe, Vercel and up to three other candidates suited to a daily finance tool on a phone, run `/ui-ux-pro-max:ui-ux-pro-max` for "finance dashboard, mobile-first, Vue" and the impeccable critique on the current screens, and write `docs/design/SHORTLIST.md` (candidates, what each offers, licence, the recommended three with reasons); copy the three chosen files to `docs/design/references/<name>.DESIGN.md` with the collection's MIT notice
- [ ] T016 [US1] Write `docs/design/DESIGN.md` per data-model.md §Design direction (character, references, decisions table, scales as final token values, motion rules, block conventions, taste dials from the taste skill, mock-up links, fallback, "building a new panel" placeholder to be completed in US3) and `docs/adr/ADR-0006-visual-identity.md` (context, the proposed identity as the decisions table's `replaced` rows, the fallback, consequences including the note that the refresh ships without a `flags` row because nothing is announced yet, status Proposed)
- [ ] T017 [US1] Apply the proposed values to `packages/ui/src/tokens.css` behind `:root[data-identity="proposed"]` and the matching dark blocks, set that attribute only inside `apps/web/src/catalogue/` wrappers, so shipped screens keep the existing system until ADR-0006 is accepted (FR-016); extend `packages/ui/src/tokens.test.ts` so the contrast pairs are asserted for both identities
- [ ] T018 [P] [US1] Build the coded mock-ups `apps/web/src/catalogue/mockups/MonthViewMock.vue`, `AddExpenseMock.vue`, `SettingsMock.vue` (proposed identity, both widths, loading/empty/error variants selectable by query string, blocks and fixtures only) and `MonthViewFallbackMock.vue` (existing identity), mounted under `/__ui/mockups/*` in `apps/web/src/router.ts`; capture "before" screenshots of the three real screens into `docs/design/before/*.png` via a one-off Playwright script `tests/e2e/tests/before.spec.ts` tagged `@manual`
- [ ] T019 [US1] Owner review on the preview URL; record the outcome: set ADR-0006 status to Accepted or Rejected (fallback), update DESIGN.md's state line, and when accepted move the proposed values to the bare `:root` and dark blocks in `packages/ui/src/tokens.css` and delete the `data-identity` hook (T017); when rejected delete the proposed blocks and the fallback mock-up becomes the mock-up

**Checkpoint**: US1 independent test passes; DESIGN.md is in `Approved` or `Approved-fallback`; `design-doc.test.ts` and the mock-up snapshots green; `tokens.css` holds exactly one identity.

---

## Phase 4: User Story 2 - The app screens follow the direction (Priority: P1)

**Goal**: the month view, add-expense flow, categories, settings and auth screens refreshed one PR each from blocks and tokens only, with no workflow change (plan Slice B).

**Independent Test**: on a phone and a laptop profile a user completes the five core flows; every screen passes axe, matches its snapshot, and each flow takes no more steps than before the refresh.

### Tests (write first, watch them fail)

- [ ] T020 [P] [US2] Write `tests/e2e/tests/keyboard.spec.ts` (ci) before any screen changes: the five core flows (sign in, add an expense in a foreign currency, change month, edit a category budget, open settings) driven by keyboard only, each asserting a visible `:focus-visible` outline on every stop and recording its step count into `tests/e2e/tests/keyboard.baseline.json`; the test then fails whenever a flow's count exceeds the recorded baseline (SC-005)
- [ ] T021 [P] [US2] Extend `tests/e2e/tests/visual.spec.ts` (ci) with the five screens (`/`, the add-expense sheet open, `/categories`, `/settings`, `/login`, `/register`, `/verify`, `/forgot`, `/reset`) at 2 × 2 over seeded data plus their loading, empty and error states forced through the mocks clock and a `?state=` query that is honoured only when `VITE_UI_CATALOGUE === 'true'`; axe on each in both themes with the WCAG 2.2 `target-size` rule enabled, plus an assertion that every focusable element's bounding box is ≥ 44 px at 360 wide and ≥ 24 px at 1280 wide (32 px allowed inside `DataTable` dense rows and `MenuButton` menus); a reduce-motion emulation case asserting no element has a non-zero computed `transition-duration`
- [ ] T022 [P] [US2] Extend `tests/e2e/lighthouserc.json` with `/` and `/settings` on the mobile preset asserting performance ≥ 90 and accessibility ≥ 95, wired into the existing `lighthouse` step of `.github/workflows/ci.yml`

### Implementation

- [ ] T023 [US2] Refresh `apps/web/src/views/MonthView.vue` from `Tile`, `PanelFrame`, `DataTable`, `Tabs` and the chart components restyled to the tokens (`packages/ui/src/charts/CategoryBars.vue`, `TrendSparkline.vue`: single hue from `--color-accent`, critical fill from `--color-critical`), desktop layout per FR-008, layout-only CSS in the view
- [ ] T024 [US2] Refresh `apps/web/src/components/ExpenseForm.vue` inside `Sheet` with `Input` (`amount` variant, tabular), `Select`, `Button` and the `Toast` undo, keeping the field order and shortcuts unchanged (keyboard baseline)
- [ ] T025 [P] [US2] Refresh `apps/web/src/views/CategoriesView.vue` (`DataTable` dense on desktop, budget editor in `Sheet`, over-budget rows in `--color-critical`) and `apps/web/src/views/SettingsView.vue` (`Tabs` sections, `ThemeToggle`, forms from `Input`/`Select`/`Button`)
- [ ] T026 [P] [US2] Refresh the auth views `apps/web/src/views/RegisterView.vue`, `LoginView.vue`, `VerifyView.vue`, `ForgotView.vue`, `ResetView.vue` from `Input` and `Button`, single-column at every width, expired/used-link states through `ErrorState`
- [ ] T027 [US2] Refresh the shell `apps/web/src/App.vue` (header, navigation, theme attribute handling) with the spacing and colour tokens so the half-refreshed product shares one header from the first screen PR onward

**Checkpoint**: US2 independent test passes; `keyboard.spec.ts` counts equal the baseline; drift test still green; Lighthouse green on `/` and `/settings`.

---

## Phase 5: User Story 3 - Reusable building blocks (Priority: P2)

**Goal**: the catalogue documents every block with variants, states and a usage example, the drift and inventory checks make the set self-enforcing, and a contributor can build a new panel from blocks alone in under thirty minutes (plan Slice C).

**Independent Test**: a contributor builds a panel with title, list, loading and empty states from the documented blocks in under thirty minutes and it passes the visual and accessibility checks without further styling.

### Tests (write first, watch them fail)

- [ ] T028 [P] [US3] Extend `packages/ui/src/tokens.test.ts`: every block in contracts/blocks.md §Inventory exists in `packages/ui/src/components` with a story whose variants and states match the inventory columns; every story has a non-empty `usage` example string; the drift scan also covers `apps/landing/src` when that directory exists
- [ ] T029 [P] [US3] Extend `tests/e2e/tests/visual.spec.ts` (ci): each story's `usage` example renders in the catalogue as a live cell plus its source in a `<pre>`, screenshotted at 2 × 2

### Implementation

- [ ] T030 [US3] Add `usage` to every `packages/ui/src/components/*.story.ts` and render it in `apps/web/src/catalogue/CatalogueView.vue` (live example, source block, jump links), and add a catalogue index page listing blocks with their purpose from the inventory
- [ ] T031 [US3] Complete `docs/design/DESIGN.md` §Building a new panel (the walkthrough: pick `PanelFrame`, choose states, wire `causeMessages`, add a story, run the tests) and run the contributor exercise from quickstart.md Slice C with a throw-away `apps/web/src/components/DemoPanel.vue`, recording the time in `docs/design/DESIGN.md` §Building a new panel, then delete the file

**Checkpoint**: US3 independent test passes; inventory and drift checks enforce SC-007 in `pnpm test:unit`.

---

## Phase 6: User Story 4 - The landing page shares the direction (Priority: P3)

**Goal**: the landing page on the same tokens with generated screenshots and the three-step explanation above the fold on a phone (plan Slice D); publication waits for the product name (ADR-0002).

**Independent Test**: three people outside the project open the landing page on their phones, describe the product in one sentence and find sign-up without help; the screenshots match the refreshed app screens.

### Tests (write first, watch them fail)

- [ ] T032 [P] [US4] Extend `tests/e2e/tests/landing.spec.ts` (ci): at 360 × 800 the headline, three steps and sign-up action are within the first viewport with no horizontal scroll; snapshot at 2 × 2; axe in both themes; every `<img>` under `/screenshots/` resolves to a file listed in `apps/landing/public/screenshots/manifest.json` with a `generatedBy: "screenshots.spec.ts"` entry
- [ ] T033 [P] [US4] Add the built landing site to `tests/e2e/lighthouserc.json` on the mobile preset (performance ≥ 90, accessibility ≥ 95)

### Implementation

- [ ] T034 [P] [US4] Write `tests/e2e/tests/screenshots.spec.ts` (tagged `@screenshots`, run by the `update-snapshots` workflow): sign in as the seeded user, render `/` and the add-expense sheet at 360 wide in light and dark, write `apps/landing/public/screenshots/{month,add}-{light,dark}.png` and `manifest.json`
- [ ] T035 [US4] Apply the tokens to `apps/landing/src/pages/index.vue` (shared `packages/ui/tokens.css`, `Button` for sign-up, the three steps as `Tile`-style cards, `<picture>` switching the light and dark screenshots on `prefers-color-scheme`), with the working name behind the existing name switch until ADR-0002 is decided

**Checkpoint**: US4 independent test passes in ci; the page stays unpublished until the name decision.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: docs and the final run.

- [ ] T036 [P] Replace the "Design system" section of `CLAUDE.md` with a pointer to `docs/design/DESIGN.md` plus the four rules that survive regardless (three theme states, status colours never as chart series, hand-written charts, no new runtime dependency); add ADR-0006 to the Key documents list; add a `CHANGELOG.md` line per slice; note the slices under Phase 4 in `docs/ROADMAP.md`
- [ ] T037 [P] Record the people-based checks (SC-001 review rounds, SC-002 five outsiders on the mock-ups, SC-008 three outsiders on the landing page) with dates and results in `docs/design/DESIGN.md` §Validation, marked `needs-rostom` in `docs/ROADMAP.md` until run
- [ ] T038 Run quickstart.md end to end on the compose stack (`pnpm lint && pnpm typecheck && pnpm test:unit && pnpm worker:build && pnpm test:e2e -- --project=ci`), trigger `update-snapshots` once more and confirm zero unexplained pixel diffs, coverage on `packages/core` and `apps/api` unchanged, and no new dependency in any `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts at the top of roadmap Phase 4; T002–T004 in parallel after T001
- **Foundational (Phase 2)**: depends on Phase 1; blocks every story. T005–T007 (tests) in parallel first; T008 before T010–T012; T009 in parallel with T008; T010 and T011 in parallel after T009; T012 after T010 and T011
- **US1 (Phase 3)**: after Phase 2. T013 and T014 in parallel; T015 → T016 → T017; T018 after T016 (needs the values) in parallel with T017; T019 last and owner-gated
- **US2 (Phase 4)**: after US1 is approved (T019). T020 must run before any screen change; T020–T022 in parallel; T027 first among implementation (shared shell), then T023 → T024, with T025 and T026 in parallel after T027
- **US3 (Phase 5)**: after Phase 2; independent of US2 except that stories written in T030 must not break screens already refreshed. T028 and T029 in parallel; T030 → T031
- **US4 (Phase 6)**: after US2's month view and add-expense (T023, T024) for the screenshots and after the `apps/landing` scaffold exists. T032 and T033 in parallel; T034 → T035
- **Polish (Phase 7)**: after every story wanted for the release; T036 and T037 in parallel; T038 last

### User Story Dependencies

- **US1 (P1)**: needs only Phase 2 → MVP (the direction and mock-ups are the first reviewable deliverable)
- **US2 (P1)**: needs US1 approved (ADR-0006 accepted or fallback chosen)
- **US3 (P2)**: needs only Phase 2
- **US4 (P3)**: needs US2's month view and add-expense screens; publication waits for ADR-0002

### Within Each User Story

- Tests are written and fail before implementation; the PR shows the test before the change
- Tokens → blocks and stories → catalogue → screens; screens hold layout-only CSS
- Every snapshot change is named in the PR description; baselines come only from the `update-snapshots` workflow

### Parallel Opportunities

- Phase 2 tests T005–T007: three files, no overlap; T010 and T011 split the blocks across two groups of files
- US1: T013 and T014; T017 and T018
- US2: T020–T022; then T025 and T026 alongside T023/T024
- US3: T028 and T029
- US4: T032 and T033

---

## Parallel Example: Phase 2

```bash
# Tests first, in parallel (three files):
Task: "Token, contrast, drift and story tests in packages/ui/src/tokens.test.ts"
Task: "Bundle test in apps/web/test/catalogue-bundle.test.ts"
Task: "Catalogue snapshots and axe in tests/e2e/tests/visual.spec.ts"

# Then tokens + story helper in parallel, then the two block groups in parallel:
Task: "packages/ui/src/tokens.css"      Task: "packages/ui/src/stories.ts"
Task: "control blocks (T010)"           Task: "surface blocks (T011)"

# Then T012 CatalogueView + fixtures + route
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + US1)

1. Phase 1 setup (tools installed with the owner, catalogue switch, snapshot workflow)
2. Phase 2 tokens, blocks, catalogue
3. US1 direction, ADR-0006 and coded mock-ups on the preview URL
4. **STOP and VALIDATE**: the owner approves the direction or picks the fallback (SC-001); five outsiders see the mock-ups (SC-002)

### Incremental Delivery

1. Slice A (Phase 2 + US1) → approved direction, tokens and blocks in the catalogue only
2. Slice B (US2) → one screen per PR, shell first
3. Slice C (US3) → catalogue complete, self-enforcing checks
4. Slice D (US4) → landing page, unpublished until the name decision

### Parallel Team Strategy

One developer working evenings (constitution rationale): follow the slice order. A second pair of hands after Phase 2 takes US3 (stories and usage examples) while the first does US1 → US2.

---

## Notes

- [P] tasks touch different files and depend on nothing incomplete
- Never push, open a PR or merge without Rostom's explicit instruction; commit locally per task
- Every PR: test shown before change, `CHANGELOG.md` line, coverage not lower, Lighthouse green where a page changed, snapshot changes named, `worker-build` green
- No new dependency, runtime or dev: the six tools live in the owner's Claude Code configuration and scratch directory; nothing they produce is committed except the three reference DESIGN.md files with their MIT notice
- The `data-identity="proposed"` hook (T017) exists only between the mock-ups and the ADR-0006 decision and is deleted in T019 either way
