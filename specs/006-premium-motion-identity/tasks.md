# Tasks: Premium Identity with Background Motion

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Scale note**: about 30 files across contracts, db, api, ui, web and landing, but the look lives in shared tokens and one component, so most screens are untouched. Every visual baseline changes, so baselines are regenerated once, in Polish, not per story.

Tests are required (constitution Principle I): every task that adds behaviour starts from a failing test named in the task.

## Phase 1: Setup (identity documents, owner-gated)

**Wave 1 — independent (different files):**

- [x] **T001** [P] Draft ADR-0007 "Premium identity with ambient motion" (Proposed), superseding ADR-0006: translucent 16 px panels, the opt-in background layer and its five presets, the light-only motion colour, the pause and panels switches, signed-out defaults, and what carries over (typography, accent presets, three theme states, status colours never used as tints) · `docs/adr/ADR-0007-premium-identity.md`
- [x] **T002** [P] Draft constitution v1.3.0: Principle VI's identity clause names ADR-0007 and allows exactly one looping effect, the opt-in background layer; bump version and amendment date · `.specify/memory/constitution.md`
- [x] **T003** [P] Rewrite the root design document for ADR-0007: surfaces, radius, blur, motion tints and alphas, the five presets, the background motion rules (pause, reduced motion, reduced data, print), keeping the spec 004 one-time motions · `DESIGN.md`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T004** `needs-rostom`: Rostom accepts ADR-0007 (marking ADR-0006 Superseded), constitution v1.3.0 and `DESIGN.md`; no code task merges before this · `docs/adr/ADR-0006-visual-identity.md`

## Phase 1b: Inherited CI failures (fix before Phase 2)

Added 2026-10-16 at Rostom's request after PR #28 merged and this branch was rebased onto `main`. Both failures predate spec 006; fixing them first means every 006 run starts green. They can run in parallel with T004.

- [ ] **T036** [P] Fix the `visual` job on `main` (ci run 38972707366, push of the PR #28 merge): `@visual screen settings light 360` fails on `screen-settings-panel1-light-360.png` (`#st-sessions`), 271 pixels (ratio 0.01) different, on the first try and on retry; the same test passed on the PR's own run, and the other 732 passed. First find what in the sessions panel differs between a PR run and a `main` push (a session row's device, time or count from the run's own state is the likely cause), then make it deterministic in the test's seed or mask that cell rather than raising the threshold; regenerate only that baseline if the fix changes it, at `--workers=2` with the `ci` project. Prove it by running the settings visual test three times in a row green · `tests/e2e/tests/visual.spec.ts` and its snapshots
- [ ] **T037** [P] Fix the `e2e-local` job (last real run 37279917465, 2026-10-05: 7 failed, 1 passed, 5 skipped). Every failure has the same cause: `POST /auth/register` returns 429 instead of 202 (`smoke.spec.ts:51`, `:135`; `widgets.local.spec.ts:40`), because each `@local` test registers a fresh account from the one `desk-local` runner IP and staging allows 20 registrations per IP per hour (`apps/api/src/routes/auth.ts:89`, `REGISTER_IP_LIMIT_PER_HOUR`). Fix it so a full run stays well under the limit: register one account per worker (or per file) through a shared fixture, reuse it across tests, and delete it at the end. Do not raise the production limit or add a bypass the public could use; if staging needs its own limit, set `REGISTER_IP_LIMIT_PER_HOUR` only on the staging Fly app and record it in the runbook. Prove it with `pnpm test:e2e --project=local` against staging twice within the same hour, then a `workflow_dispatch` run on `desk-local` · `tests/e2e/fixtures/local-account.ts` (new), `tests/e2e/tests/smoke.spec.ts`, `tests/e2e/tests/widgets.local.spec.ts`
- [ ] **T038** `needs-rostom`: approve pending e2e-local runs in the `local-secrets` environment, or change its approval setup. Since 2026-10-05 every scheduled run has waited for that approval and been cancelled (run 38861682730 is waiting now), so T037 can only be confirmed on CI once a run is approved · GitHub environment `local-secrets`

## Phase 2: Foundational (blocks every story)

**Wave 1 — independent (different files):**

- [x] **T005** [P] Write `motion.test.ts` first (ids in order, default `particles`, six swatches, dark tint), then add `MOTION_PRESET_IDS`, `MOTION_SWATCHES`, `MOTION_DARK_TINT` and export them · `packages/contracts/src/motion.ts`, `packages/contracts/src/motion.test.ts`, `packages/contracts/src/index.ts`
- [x] **T006** [P] Write the migration test first (defaults on existing rows, CHECK rejects `'sparkle'` and `'#FFF'`), then add the four `users` columns and migration `0012_user_motion.sql` per data-model · `packages/db/src/schema.ts`, `packages/db/migrations/0012_user_motion.sql`, `apps/api/test/user-motion-migration.test.ts`
- [x] **T007** [P] Add `--color-surface-glass`, `--blur-surface`, `--radius-xl` and the motion alpha tokens for all three theme states, with `tokens.test.ts` cases for each state · `packages/ui/src/tokens.css`, `packages/ui/src/tokens.test.ts`
- [x] **T008** [P] Write the SC-004 matrix test first (5 presets × 6 swatches plus `#ffffff` and `#000000` × 2 themes × glass and opaque panels: every text token ≥ 4.5:1 over the composited ground), then add `compositeOver()` · `packages/ui/src/contrast.ts`, `packages/ui/src/contrast.test.ts`
- [x] **T009** [P] Seed the `appearance.motion` flag, off · `packages/db/src/seed.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T010** [P] Extend `UserResponse` and `PatchMeRequest` with the four fields (contract tests: enum, colour regex, lowercase) · `packages/contracts/src/auth.ts`, `packages/contracts/src/me.ts`, `packages/contracts/src/accent.test.ts`
- [x] **T011** [P] Write `BackgroundMotion.test.ts` first (renders per `data-motion`, `aria-hidden`, nothing for `none`), then add the component and `motion.css` (five presets' keyframes on transform and opacity only, paused under `data-motion-paused`, `animation: none` under reduced motion and reduced data, hidden in print, `pointer-events: none`, `display: none` under `forced-colors: active` (FR-024), and still `.motion-thumb[data-preset]` rules that reuse each preset's drawing with `animation: none` for the picker, research R12) · `packages/ui/src/components/BackgroundMotion.vue`, `packages/ui/src/components/BackgroundMotion.test.ts`, `packages/ui/src/components/BackgroundMotion.story.ts` (the inventory test in `tokens.test.ts` needs a story and a row in `specs/004-web-ui-refresh/contracts/blocks.md`), `packages/ui/src/motion.css`, `packages/ui/src/index.ts`
- [x] **T012** [P] Write the failing `PanelFrame`, `Tile` and `WidgetFrame` unit cases first (each carries `.surface`; the rule sets the glass background, blur and `--radius-xl`; under `data-panels="solid"` it is opaque), then apply the `.surface` rule (glass with `@supports` and `data-panels="solid"` fallbacks) to the panel, tile and widget frames; the header, dialogs, menus, sheets and toasts stay opaque raised Flap on the Overlay shadow for legibility. The same opaque fallback applies under `forced-colors: active` and `prefers-reduced-transparency: reduce` without touching the saved switch (FR-024, FR-025, research R11) · `packages/ui/src/components/PanelFrame.vue`, `packages/ui/src/components/Tile.vue`, `apps/web/src/components/widgets/WidgetFrame.vue`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T013** [P] Write the API tests first (`PATCH /me` sets and validates each field; 401 signed out; user A's patch leaves user B unchanged in the ownership matrix, and `GET /flags/public` listed as a public route that returns no user data), then map and patch the fields · `apps/api/src/routes/me.ts`, `apps/api/src/routes/auth.ts`, `apps/api/test/me-appearance.test.ts`, `apps/api/test/ownership.test.ts`
- [x] **T014** [P] Write the test first (unauthenticated 200, only `appearance.motion` listed, global value even with a user override present, `Cache-Control`), then add `GET /flags/public` · `apps/api/src/routes/misc.ts`, `apps/api/test/flags-public.test.ts`
- [x] **T015** [P] Write `theme.test.ts` cases first (attributes for flag off, signed out, light, dark tint, pause, solid panels, unknown preset and bad colour fallbacks per FR-016, and `navigator.connection.saveData` true sets `data-motion-paused` per FR-025), then add `applyMotion()` · `apps/web/src/views/theme.ts`, `apps/web/src/views/theme.test.ts`

**⟶ Wait for Wave 3 to finish, then:**

- [x] **T016** Regenerate the OpenAPI document · `packages/contracts/openapi.json`
- [x] **T017** Write `App.test.ts` cases first (the layer is mounted behind `<RouterView>`; `visibilitychange` to hidden sets `data-motion-paused` and back to visible clears it unless the user paused; signed out, `GET /flags/public` is requested and `GET /flags` is not), then mount `BackgroundMotion` behind `<RouterView>`, add `applyMotion` to the session and flags watch, set `data-motion-paused` on `visibilitychange`, and load `GET /flags/public` when signed out · `apps/web/src/App.vue`, `apps/web/src/App.test.ts`, `apps/web/src/stores/flags.ts`

**Checkpoint**: every screen renders the new panels over the background, and the layer follows the html attributes.

## Phase 3: User Story 1, choose the appearance in Settings (P1) 🎯 MVP

Files: `apps/web/src/components/appearance/AppearanceSettings.vue`, `apps/web/src/views/SettingsView.vue`

**Goal**: Settings › Appearance offers the five presets, the light-only colour row, and the panels and pause switches, all saved to the account.

### Tests

- [x] **T018** [P] [US1] Unit tests for `AppearanceSettings` (radiogroup and switch roles and names, 44 px targets, colour row hidden in dark and disabled under None, save error by code with "Try again"; each preset shows a still `.motion-thumb`; with fake timers, five quick picks send one `PATCH /me` with the last value, a change during an in-flight save is sent after it, an older response does not overwrite a newer preview, and dragging the custom colour sends one request on `change`) · `apps/web/src/components/appearance/AppearanceSettings.test.ts`
- [x] **T019** [P] [US1] e2e: default Particles; pick Board grid, reload, and a fresh context shows it; pick Grain then Aurora drift in context A and a new context B opens on Aurora drift (FR-004, last save wins); user A and B isolation; switches persist; axe on Settings · `tests/e2e/tests/motion-settings.spec.ts`

### Implementation

- [x] **T020** [US1] Build `AppearanceSettings` per `contracts/ui.md`, with auto-save on change through a coalesced queue (research R9: 400 ms debounce, merged fields, one request in flight, stale responses ignored, failure keeps the preview), preset thumbnails (R12), and the session user updated so `applyMotion` reacts without a reload · `apps/web/src/components/appearance/AppearanceSettings.vue`

**⟶ Wait for T020, then:**

- [x] **T021** [US1] Mount `AppearanceSettings` in Settings › Appearance behind `appearance.motion`, and replace Settings' own column rules with `.board-grid` (US2's rule; Settings is owned here so only one phase edits it) · `apps/web/src/views/SettingsView.vue`

**Checkpoint**: a user can choose and keep every appearance setting.

## Phase 4: User Story 2, fluid panels on every screen (P1)

Files: `packages/ui/src/layout.css`, the screens listed in T023, `tests/e2e/tests/reflow.spec.ts`

### Tests

- [x] **T022** [P] [US2] e2e: every signed-in and signed-out route at 360, 768 and 1280 in both themes asserts `scrollWidth <= clientWidth`; one column at 360 and two at 768 on the month view; content ≤ 1160 px · `tests/e2e/tests/reflow.spec.ts`

### Implementation

- [x] **T023** [P] [US2] Add `.board-grid` (research R7) and replace each screen's own column rules with it; these are the screens that set their own `grid-template-columns` today (Settings is done in T021) · `packages/ui/src/layout.css`, `apps/web/src/views/MonthView.vue`, `apps/web/src/views/TodayView.vue`, `apps/web/src/views/ConnectionsView.vue`, `apps/web/src/views/ConnectorsView.vue`, `apps/web/src/components/widgets/WidgetStrip.vue`

**Checkpoint**: no route scrolls sideways at any of the three widths.

## Phase 5: User Story 3, motion colour across screens (P2)

Files: `tests/e2e/tests/motion-colour.spec.ts`. The colour logic is foundational (T015) and its control belongs to US1 (T020); this phase proves the cross-screen behaviour.

- [x] **T024** [US3] e2e: Coral in light tints the month view's layer (`--motion-tint`); dark hides the row and uses the dark tint; back in light Coral is restored; a custom colour persists; axe passes over the lightest and darkest custom colour · `tests/e2e/tests/motion-colour.spec.ts`

## Phase 6: User Story 4, motion that respects the person and the device (P2)

Files: `tests/e2e/tests/motion-a11y.spec.ts`

- [x] **T025** [US4] e2e: with `reducedMotion: 'reduce'`, two screenshots 3 s apart are identical for every preset (SC-005); a hidden page sets `data-motion-paused` and the computed `animation-play-state` is `paused`; the layer has `pointer-events: none`, `position: fixed` (its bounding box is unchanged after scrolling a long page) and is absent in print media; with `prefers-reduced-data: reduce` emulated through CDP `Emulation.setEmulatedMedia`, the layer is still; with `forcedColors: 'active'` the layer is not displayed and panels are opaque; with `prefers-reduced-transparency: reduce` emulated through CDP, panels are opaque while the saved switch still reads on (FR-024, FR-025); the header has no `backdrop-filter` and an opaque background (FR-009); `document.elementFromPoint` at a panel's centre returns the panel, not the layer (FR-013) · `tests/e2e/tests/motion-a11y.spec.ts`

## Phase 7: User Story 5, signed-out pages share the look (P2)

Files: `apps/landing/src/App.vue`, `apps/landing/src/pages/`, `apps/web/src/views/LoginView.vue`, `apps/web/src/views/RegisterView.vue`, `apps/web/src/views/ResetView.vue` and their tests, `.github/workflows/deploy-staging.yml`, `tests/e2e/tests/motion-signed-out.spec.ts`

### Tests

- [x] **T026** [P] [US5] e2e: sign-in, sign-up and reset show Particles in the default tint with the flag on and a still ground with it off; a signed-out page never shows the last user's choice; the sign-in, sign-up and reset forms and the landing sections sit on a `.surface` panel · `tests/e2e/tests/motion-signed-out.spec.ts`

### Implementation

- [x] **T027** [P] [US5] Mount `BackgroundMotion` in the landing app when `VITE_APPEARANCE_MOTION` is `true` (default off), with a landing build test · `apps/landing/src/App.vue`
- [x] **T039** [P] [US5] Write failing unit cases first (the form sits inside a `.surface` panel, max 28rem wide, centred, reflowing at 360), then wrap the sign-in, sign-up and reset forms in the shared panel; screen files keep layout only · `apps/web/src/views/LoginView.vue`, `apps/web/src/views/RegisterView.vue`, `apps/web/src/views/ResetView.vue`, `apps/web/src/views/LoginView.test.ts`, `apps/web/src/views/RegisterView.test.ts`, `apps/web/src/views/ResetView.test.ts` (new)
- [x] **T040** [P] [US5] Write a failing landing build test first (each content section renders inside a `.surface` panel), then put the landing page sections on the shared panel · `apps/landing/src/pages/`
- [x] **T028** [P] [US5] Pass `VITE_APPEARANCE_MOTION` to the landing build from a repo variable in the workflow that builds the landing site (unset means off), and add the announce step (turn the flag on, set the variable, redeploy the landing site) to the release runbook · `.github/workflows/deploy-staging.yml`

## Phase 8: User Story 6, ship dark until announced (P3)

Files: `tests/e2e/tests/motion-flag.spec.ts`

- [x] **T029** [US6] e2e: with the flag off there are no appearance controls and a still ground while panels stay translucent; turning the flag on for a user with a saved preset applies it · `tests/e2e/tests/motion-flag.spec.ts`

## Phase 9: Polish

**Wave 1 — independent (different files):**

- [ ] **T030** [P] Add `/` and `/settings` with Particles and with Aurora drift (the costliest preset) to the Lighthouse run and assert they are not below the spec 004 numbers (`/` 0.69, `/settings` 0.86), accessibility ≥ 0.95, and landing ≥ 0.90 / 0.95 (SC-006, FR-021) · `lighthouserc.json`
- [ ] **T031** [P] Run the design tools per CLAUDE.md (redesign-existing-projects audit, `npx -y impeccable@4.1.0 detect` at 360 and 1280, `impeccable-finish-reviewer`) and fix or justify every non-advisory finding · `specs/006-premium-motion-identity/design-tools.md`
- [ ] **T032** [P] CHANGELOG line, `docs/ROADMAP.md` entry, and the CLAUDE.md design-system section and current state for ADR-0007 · `CHANGELOG.md`, `docs/ROADMAP.md`, `CLAUDE.md`

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T033** Regenerate every web and landing visual baseline once at `--workers=2` with the `ci` project only, and review the diffs · `tests/e2e/tests/*-snapshots/`
- [ ] **T034** Validate against the Success Criteria: lint, typecheck, unit (coverage ≥ 85 % on core and api), api, `worker:build`, `pnpm test:e2e --project=ci --workers=2`, OpenAPI not stale · whole repo
- [ ] **T035** `needs-rostom`: owner sign-off of every screen at phone and desktop width against the direction board (SC-007) and the 20-second change check (SC-001) · `docs/ROADMAP.md`

## Dependencies & Execution Order

Setup (T001–T004) gates any code merge, though Foundational may be written while T004 waits. Phase 1b runs T036 and T037 in parallel; Foundational starts once both pass locally. T038 (owner) only gates confirming T037 on CI and blocks nothing. Foundational runs Wave 1 (T005–T009), then Wave 2 (T010–T012), then Wave 3 (T013–T015), then T016 and T017. Every story starts after Foundational. US1 runs T018 and T019 together, then T020, then T021. US2 runs T022 and T023 together. US3 (T024) needs US1's T020. US4 (T025) needs only Foundational. US5 runs T026, T027, T028, T039 and T040 together. US6 (T029) needs US1's T021. Polish runs Wave 1 (T030–T032), then T033, then T034, then T035, after all stories.
