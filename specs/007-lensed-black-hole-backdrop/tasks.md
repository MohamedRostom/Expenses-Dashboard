# Tasks: Event horizon background

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)

Every test is written first and seen to fail before the code it covers. Visual baselines come only from the Playwright container at `--workers=2`.

## Phase 1: Setup

Files: `docs/adr/ADR-0009-webgl-background-preset.md`, `tests/e2e/playwright.config.ts`

**Wave 1 — independent (different files):**

- [ ] **T001** [P] Write ADR-0009 "WebGL background preset" (Proposed), amending DESIGN.md's Background layer rule to allow one lazily loaded WebGL preset under the same stop rules, with signed-out pages and landing kept on Particles (R10) · docs/adr/ADR-0009-webgl-background-preset.md
- [ ] **T002** [P] Spike: draw a fixed WebGL frame in the `visual` project inside the Playwright container, screenshot it twice and in two runs, and pin `--use-angle=swiftshader` in the visual project's launch arguments if the shots differ (R9) · tests/e2e/playwright.config.ts

## Phase 2: Foundational

Files: `packages/contracts/src/motion.ts`, `packages/contracts/src/motion.test.ts`, `packages/contracts/openapi.json`, `packages/db/migrations/0016_event_horizon.sql`, `packages/db/migrations/meta/_journal.json`, `packages/db/src/flags.ts`, `packages/db/src/seed.ts`, `apps/api/test/user-motion-migration.test.ts`, `apps/api/test/all-flags.test.ts`, `packages/ui/src/motion/loop.ts`, `packages/ui/src/motion/loop.test.ts`, `.github/workflows/ci.yml`

The loop controller is foundational: the renderer cannot run without it, and it carries the stop conditions (FR-008) and detail tiers (FR-010) that US2 and US3 prove end to end.

**Wave 1 — independent (different files), tests first:**

- [ ] **T003** [P] Expect `MOTION_PRESET_IDS` to be the six ids ending in `event-horizon` · packages/contracts/src/motion.test.ts
- [ ] **T004** [P] Migration test: after 0016, `users_motion_preset_check` accepts `event-horizon` and still rejects an unknown id, existing rows keep their value, and flag `appearance.event_horizon` exists with `default_on = false`; point the CHECK-lists-every-id assertion at 0016 · apps/api/test/user-motion-migration.test.ts
- [ ] **T005** [P] Expect `appearance.event_horizon` in the all-flags check · apps/api/test/all-flags.test.ts
- [ ] **T006** [P] Loop unit tests with a fake clock and fake rAF: draws at most 30 frames a second with time-based `t`; under each of the user's pause (`data-motion-paused`), reduced motion, reduced data and a hidden tab it draws exactly one frame and then none; it resumes when all clear; it drops a tier when more than 10 % of frames miss 33 ms over 2 s; it holds still after the lowest tier is late; `release()` removes every listener and observer (FR-008, FR-010) · packages/ui/src/motion/loop.test.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [ ] **T007** [P] Add `event-horizon` to `MOTION_PRESET_IDS` and update the comment that names the CHECK migration · packages/contracts/src/motion.ts
- [ ] **T008** [P] Write migration 0016: drop and re-add `users_motion_preset_check` with the six ids, insert `appearance.event_horizon` with `default_on = false` (no `DO UPDATE` to true), and add journal entry 16 · packages/db/migrations/0016_event_horizon.sql, packages/db/migrations/meta/_journal.json
- [ ] **T009** [P] Add `appearance.event_horizon` to `ALL_FLAGS` and the seed · packages/db/src/flags.ts, packages/db/src/seed.ts
- [ ] **T010** [P] Write the loop controller: 30 fps rAF driver, the four stop conditions (MutationObserver on `<html>`, two `matchMedia` queries, `visibilitychange`), the three detail tiers, still at the lowest, `release()` (R4 to R6) · packages/ui/src/motion/loop.ts

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [ ] **T011** [P] Regenerate the OpenAPI document (`pnpm --filter @desk/contracts generate:openapi`) · packages/contracts/openapi.json
- [ ] **T012** [P] Switch `appearance.event_horizon` off globally in CI like the other appearance flags, on per test · .github/workflows/ci.yml

## Phase 3: User Story 1 - Choose a moving black hole as the background (P1, MVP)

Files: `packages/ui/src/motion/eventHorizon.glsl.ts`, `packages/ui/src/motion/eventHorizon.ts`, `packages/ui/src/motion/eventHorizon.test.ts`, `packages/ui/src/components/BackgroundMotion.vue`, `apps/web/src/views/theme.ts`, `apps/web/src/views/theme.test.ts`, `apps/web/src/App.vue`, `apps/web/src/components/appearance/AppearanceSettings.vue`, `apps/web/src/components/appearance/AppearanceSettings.test.ts`, `packages/ui/src/contrast.test.ts`, `tests/e2e/tests/event-horizon-settings.spec.ts`, `tests/e2e/tests/event-horizon-physics.spec.ts`, `tests/e2e/tests/event-horizon-motion.spec.ts`

**Goal**: picking "Event horizon" in Settings shows a moving, physically lensed black hole that is saved on the account.
**Independent Test**: with the flag on, pick the preset in Chromium and see the shadow, disc and lensed arc move over ten seconds.

### Tests

**Wave 1 — independent (different files):**

- [ ] **T013** [P] [US1] e2e: with the flag on, picking "Event horizon" in Settings sets `data-motion="event-horizon"` and shows the canvas; after a reload and in a second browser context signed in as the same user it is still chosen (FR-001, FR-002) · tests/e2e/tests/event-horizon-settings.spec.ts
- [ ] **T014** [P] [US1] e2e: in a still frame under reduced motion, read back the canvas pixels: the shadow's measured radius is within 3 % of the critical impact parameter for the fixed framing, a lensed arc appears above the shadow, and the approaching side is brighter than the receding side (FR-003, FR-004, SC-004) · tests/e2e/tests/event-horizon-physics.spec.ts
- [ ] **T015** [P] [US1] e2e: two canvas readbacks 2 s apart differ inside the disc and match outside it; at the inner edge the angle moved matches a 40 s period within 10 % (FR-005) · tests/e2e/tests/event-horizon-motion.spec.ts
- [ ] **T016** [P] [US1] Unit: `applyMotion` writes `none` for `event-horizon` while `appearance.event_horizon` is off, and keeps the saved value (Edge Cases) · apps/web/src/views/theme.test.ts
- [ ] **T017** [P] [US1] Unit: Settings hides "Event horizon" while its flag is off and shows it with the label `Event horizon` and the line `A black hole bending the light of its own disc` while on; with the flag off and the preset saved, None shows as checked (FR-001) · apps/web/src/components/appearance/AppearanceSettings.test.ts
- [ ] **T018** [P] [US1] Contrast: composite the preset's worst pixels (the brightest disc pixel and the darkest shadow pixel at the canvas opacity cap) under every text pair, in all three theme states and both panel modes, for every swatch plus `#ffffff` and `#000000` (FR-006, FR-007, SC-005) · packages/ui/src/contrast.test.ts
- [ ] **T019** [P] [US1] Unit with a fake GL context: compile failure or no WebGL leads to the fallback; a lost context not restored in 3 s leads to the fallback; a restored context reloads; changing `data-motion` releases the context and the loop (FR-009, Edge Cases) · packages/ui/src/motion/eventHorizon.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T020** [P] [US1] Write the shader sources: full-screen triangle, per-pixel Verlet integration of a = -1.5 h² x / r⁵, disc-plane crossings for 3 < r < 12, capture below r = 1, escape past r = 30, Doppler beaming and redshift, Keplerian flow with a 40 s inner period, colour from white-hot to the tint uniform, a step-count uniform for the tiers (R1 to R3) · packages/ui/src/motion/eventHorizon.glsl.ts
- [ ] **T021** [P] [US1] Make `applyMotion` take the new flag and write `none` for `event-horizon` while it is off · apps/web/src/views/theme.ts
- [ ] **T022** [P] [US1] Add the label and line to `PRESETS`, hide the option while the flag is off, and check None when the saved preset is hidden · apps/web/src/components/appearance/AppearanceSettings.vue

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T023** [US1] Write the renderer: compile, uniforms (time, resolution, steps, tint read from `--motion-tint`), half-resolution sizing with a ResizeObserver that keeps the shadow round, draw through `loop.ts`, context loss and restore, fallback signal (R2, R5, R7) · packages/ui/src/motion/eventHorizon.ts

**⟶ Wait for T023 to finish, then:**

**Wave 3 — independent (different files):**

- [ ] **T024** [P] [US1] Mount a canvas and dynamically import the renderer only while `data-motion="event-horizon"`; add the CSS still drawing used as fallback and as `.motion-thumb[data-preset='event-horizon']`; set the canvas opacity caps per theme to the values T018 settles (R3, R7, FR-011, FR-012) · packages/ui/src/components/BackgroundMotion.vue
- [ ] **T025** [P] [US1] Pass `flags.isOn('appearance.event_horizon')` into the motion watch and `applyMotion` · apps/web/src/App.vue

**Checkpoint**: User Story 1 is independently functional and testable.

## Phase 4: User Story 2 - It stops whenever the person or the device asks (P1)

Files: `tests/e2e/tests/event-horizon-stops.spec.ts`

**Goal**: the preset holds a still frame and draws nothing under each stop condition.
**Independent Test**: toggle each condition in Chromium and count draw calls.

### Tests

- [ ] **T026** [US2] e2e: wrap `drawArrays` in an init script to count frames; with the preset moving, count zero frames over 5 s under the user's pause, under emulated reduced motion, under emulated reduced data, and while the page is hidden, then count frames again once each clears (FR-008, SC-006) · tests/e2e/tests/event-horizon-stops.spec.ts

### Implementation

The stop logic is T010 (Foundational) and its wiring is T023. This phase proves it end to end and adds no code.

**Checkpoint**: User Story 2 is independently testable.

## Phase 5: User Story 3 - Devices that cannot draw it still get a good background (P2)

Files: `tests/e2e/tests/event-horizon-fallback.spec.ts`, `tests/e2e/tests/event-horizon-detail.spec.ts`, `tests/e2e/tests/event-horizon-loading.spec.ts`

**Goal**: weak or WebGL-less devices get a calm still image and an unslowed app.
**Independent Test**: disable WebGL, lose the context and throttle the CPU in Chromium.

### Tests

**Wave 1 — independent (different files):**

- [ ] **T027** [P] [US3] e2e: with `getContext('webgl')` returning null, the CSS still drawing shows and the console has no errors; after `WEBGL_lose_context.loseContext()` the still drawing shows within 3 s, and after `restoreContext()` frames resume (FR-009) · tests/e2e/tests/event-horizon-fallback.spec.ts
- [ ] **T028** [P] [US3] e2e: under CDP CPU throttling the renderer lowers its tier, and at the heaviest throttle it holds a still frame (FR-010) · tests/e2e/tests/event-horizon-detail.spec.ts
- [ ] **T029** [P] [US3] e2e: with any other preset, no request for the event-horizon chunk is made and the month view's transferred bytes match the run before the feature (FR-011, SC-003) · tests/e2e/tests/event-horizon-loading.spec.ts

### Implementation

Fallback and tiers are built in T010, T023 and T024. This phase proves them on throttled and WebGL-less browsers.

**Checkpoint**: User Story 3 is independently testable.

## Phase 6: User Story 4 - A preview in Settings (P3)

Files: `packages/ui/src/components/BackgroundMotion.test.ts`

### Tests

- [ ] **T030** [US4] Add `event-horizon` to the preset list: its thumbnail rule exists, uses no `url()` and no animation; the canvas sits inside the `aria-hidden` layer with `pointer-events: none` and is hidden under forced colours and print (FR-001, FR-012) · packages/ui/src/components/BackgroundMotion.test.ts

### Implementation

The thumbnail is the CSS still drawing from T024.

**Checkpoint**: User Story 4 is independently testable.

## Phase 7: Polish

Files: `DESIGN.md`, `CLAUDE.md`, `CHANGELOG.md`, `tests/e2e/tests/visual.spec.ts`, `tests/e2e/lighthouserc.session.json`, `specs/007-lensed-black-hole-backdrop/verification.md`

**Wave 1 — independent (different files):**

- [ ] **T031** [P] DESIGN.md: add the Event horizon row to the preset table with its caps, amend the Technique line per ADR-0009, and update the Settings preset count · DESIGN.md
- [ ] **T032** [P] CLAUDE.md: note the sixth preset, ADR-0009, and that `appearance.event_horizon` is off by default, unlike the accent and motion flags · CLAUDE.md
- [ ] **T033** [P] CHANGELOG line under Unreleased · CHANGELOG.md
- [ ] **T034** [P] Visual baselines of the still frame at 360 and 1280 in light and dark, plus the Settings thumbnail, generated in the container · tests/e2e/tests/visual.spec.ts
- [ ] **T035** [P] Lighthouse on the signed-in month view with the preset chosen: performance at least 0.9, accessibility at least 0.95 (SC-002) · tests/e2e/lighthouserc.session.json
- [ ] **T036** [P] One-hour soak in Chromium recording heap size and frame time at minute 1 and minute 60, within 10 % (SC-007), written up with the numbers · specs/007-lensed-black-hole-backdrop/verification.md

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T037** Design tools: `npx -y impeccable@4.1.0 detect` on the changed files and the routes at 360 and 1280, then the `impeccable-finish-reviewer` agent; the commit carries a "Design tools" section
- [ ] **T038** Validate against Success Criteria: lint, typecheck, unit, API, `worker:build`, OpenAPI not stale, e2e `ci` and `visual` at `--workers=2`
- [ ] **T039** `needs-rostom`: view it on a real phone and laptop (SC-001, verification step 6), accept or amend ADR-0009, and decide when to turn the flag on

## Dependencies & Execution Order

- **Setup → Foundational → US1 → US2, US3, US4 → Polish.** US2, US3 and US4 own only their test files, so they can run in parallel once US1 is done.
- **Setup**: one wave (T001, T002).
- **Foundational**: Wave 1 tests (T003 to T006) block Wave 2 code (T007 to T010), which blocks Wave 3 (T011, T012).
- **US1**: the test wave (T013 to T019) comes first. Then Wave 1 (T020 to T022), then T023, then Wave 3 (T024, T025).
- **US2, US3, US4**: T026; T027 to T029 in parallel; T030.
- **Polish**: Wave 1 (T031 to T036), then T037, T038 and the owner's T039.
