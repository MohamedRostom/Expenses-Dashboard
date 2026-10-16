# Feature Specification: Premium Identity with Background Motion

**Feature Branch**: `phase-5/006-premium-motion`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Spec 006 'Premium identity with background motion' (supersedes the Concourse Board identity of ADR-0006 per owner decision 2026-10-16; approved direction board https://claude.ai/artifact/NHdkria1bTDsVYGyW1TXE8). Every signed-in screen gets the new premium look: translucent (frosted) raised panels with 16px radius over an ambient background layer; panels are fluid and reflow by screen width. Settings > Appearance gains a 'Background motion' picker with five pre-stored presets: None, Aurora drift, Board grid, Particles (default), Grain, saved to the user's account and applied on every screen. A 'Motion colour' selector (six stored swatches plus a custom colour) is shown only in light mode; dark mode uses a fixed dark-tuned tint. Motion pauses when the tab is hidden and is still under reduced motion. Text contrast stays AA. Gated behind `appearance.motion`. Lighthouse budgets must not regress. Requires ADR-0007 superseding ADR-0006 and a constitution Principle VI amendment."

## Owner decisions behind this spec (2026-10-16)

Rostom reviewed the direction board and decided: replace the Concourse Board identity rather than layer on it; take the board's surface polish (translucent raised panels) together with the motion; offer all four motion families plus None, with Particles as the default; keep the choice on the user's account; show the colour selector only in light mode; and make panels reflow by screen size. These are settled and are not reopened by this spec.

## Clarifications

### Session 2026-10-16

- Q: Should the new panel look go live in production on merge, or wait behind the `appearance.motion` flag? → A: The look ships unflagged (constitution 1.1.1); only the appearance controls and the moving layer wait for the flag.
- Q: Should the signed-out pages (sign-in, sign-up, password reset, landing) get the new look in this spec? → A: Yes, all signed-out pages, with a fixed default motion.
- Q: Should users be able to switch panels from translucent to solid? → A: Yes, a user toggle saved to the account.
- Q: Besides the device's reduced-motion setting, should Settings have its own pause switch? → A: Yes, a separate "Pause background motion" switch saved to the account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a background motion in Settings (Priority: P1)

A signed-in user opens Settings › Appearance, sees a "Background motion" group with five named presets (None, Aurora drift, Board grid, Particles, Grain), each with a one-line description, and picks one. The background behind every signed-in screen changes to that preset straight away, and the choice is still there after signing out and back in on another device.

**Why this priority**: the picker is the feature. Without it there is nothing for the user to choose and the motion layer would be a fixed decoration.

**Independent Test**: sign in as a seeded user with the flag on, pick Board grid, reload, open the month view and the categories screen in a fresh browser session as the same user; both show Board grid.

**Acceptance Scenarios**:

1. **Given** a user who has never chosen a preset, **When** they open any signed-in screen, **Then** the background shows Particles and Settings shows Particles as selected.
2. **Given** a user on Settings › Appearance, **When** they pick Aurora drift, **Then** the background changes without a page reload, the Aurora drift option is marked as selected for assistive technology, and the choice is saved to their account.
3. **Given** a user who picked Grain on one device, **When** they sign in on another device, **Then** every signed-in screen shows Grain.
4. **Given** a user who picks None, **When** they browse any signed-in screen, **Then** the background is a still ground with no moving layer at all.
5. **Given** user A picked Board grid and user B picked Aurora drift, **When** each signs in, **Then** each sees only their own preset (ownership isolation).

---

### User Story 2 - Premium, fluid panels on every screen (Priority: P1)

Every signed-in screen (month view, entries, categories, budgets, import, connections, panels, settings) shows its content on raised, translucent panels with soft rounded corners over the background layer, and the panels rearrange to fit the screen: one column on a phone, two on a tablet, the full grid on a desktop, never wider than a comfortable reading width and never forcing sideways scrolling of the page.

**Why this priority**: the owner chose to replace the identity, so the new look must cover every screen, not just the one the motion is chosen on. It is P1 alongside the picker because a moving background behind the old opaque board would hide the motion.

**Independent Test**: visit every signed-in route at 360, 768 and 1280 pixels wide, in light and dark, and compare against the approved baselines; no route scrolls horizontally at any width.

**Acceptance Scenarios**:

1. **Given** a phone-width screen (360 px), **When** the user opens the month view, **Then** tiles and panels stack in a single column and nothing scrolls sideways except a wide table inside its own scroll box.
2. **Given** a tablet-width screen (768 px), **When** the user opens the month view, **Then** panels sit in two columns.
3. **Given** a desktop-width screen (1280 px or wider), **When** the user opens any signed-in screen, **Then** content is centred and no wider than 1160 px, and the tile row fills the available width.
4. **Given** a browser that cannot blur what is behind a surface, **When** the user opens any screen, **Then** panels fall back to an opaque surface of the same colour and every text pair still meets contrast.

---

### User Story 3 - Pick the motion colour in light mode (Priority: P2)

In light mode, Settings › Appearance shows a "Motion colour" row under the presets: six stored swatches (Signal mint, Platform blue, Lamp amber, Dusk violet, Coral, Silver) and a custom colour. The chosen colour tints the moving layer on every screen. In dark mode the row is hidden and the motion uses a fixed tint tuned for dark backgrounds; switching back to light restores the user's colour.

**Why this priority**: it personalises the motion but the feature is complete without it, since every preset already has a default tint.

**Independent Test**: in light mode pick Coral and see the particles turn coral on the month view; switch to dark and confirm the colour row is gone and the fixed dark tint is used; switch back to light and confirm Coral is still selected.

**Acceptance Scenarios**:

1. **Given** light mode, **When** the user opens Settings › Appearance, **Then** the Motion colour row is visible with six named swatches and a custom option, each reachable by keyboard and announced by name.
2. **Given** light mode and the user picks a custom colour, **When** they return to any screen, **Then** the moving layer uses that colour and all text over it still meets contrast.
3. **Given** dark mode (chosen explicitly or by the system), **When** the user opens Settings › Appearance, **Then** the Motion colour row is not shown and the background uses the fixed dark tint.
4. **Given** a user who chose Coral in light mode and then switched to dark, **When** they switch back to light, **Then** Coral is selected and used again.
5. **Given** the None preset, **When** the user is in light mode, **Then** the colour row is shown but disabled with a note that it applies when a motion is on.
6. **Given** Settings › Appearance, **When** the user turns "Translucent panels" off, **Then** every screen shows opaque panels of the same colour, the choice is saved to their account, and it is on by default.
7. **Given** a user who turns "Pause background motion" on, **When** they browse any screen, **Then** their chosen preset shows its still frame, the choice is saved to their account, and turning it off resumes the motion.

---

### User Story 4 - Motion that respects the person and the device (Priority: P2)

Someone who has asked their system to reduce motion sees the chosen preset as a still image; nothing moves. When the tab is hidden, the background stops using the device. The motion never competes with the figures, which stay the most prominent thing on the screen.

**Why this priority**: it is a hard accessibility and performance requirement, but it constrains Stories 1–3 rather than adding value on its own.

**Independent Test**: with reduced motion requested by the system, open every preset and confirm the background is identical across two screenshots taken a few seconds apart; with motion allowed, hide the tab and confirm the animation is paused.

**Acceptance Scenarios**:

1. **Given** the system asks for reduced motion, **When** any preset is selected, **Then** the background shows that preset's still frame and nothing in it moves.
2. **Given** motion is allowed, **When** the tab or window is hidden, **Then** the background animation is paused, and it resumes when the tab is shown again.
3. **Given** any preset and any colour, **When** a screen shows figures, labels and status words, **Then** every text pair meets WCAG AA (4.5:1 for body text, 3:1 for large text) in both themes.
4. **Given** the moving layer, **When** the user clicks, taps, scrolls or uses the keyboard, **Then** the layer never receives input and never sits above content.

---

### User Story 5 - Signed-out pages share the look (Priority: P2)

Sign-in, sign-up, password reset and the landing site use the same panels over the background. Nobody is signed in yet, so there is no saved choice: these pages show the default motion (Particles in Signal mint in light mode, the fixed dark tint in dark mode).

**Why this priority**: the first thing a new user sees should match the app they are signing up for; it follows Story 2's panels and Story 4's motion rules.

**Independent Test**: visit each signed-out page at 360, 768 and 1280 px in both themes with the flag on and off; with the flag on the default motion runs (still under reduced motion), with it off the ground is still; the landing page keeps its performance ≥ 90 and accessibility ≥ 95 budgets.

**Acceptance Scenarios**:

1. **Given** the flag is on and nobody is signed in, **When** a visitor opens sign-in or the landing page, **Then** the panels sit over Particles in the default tint for the current theme.
2. **Given** a visitor whose system asks for reduced motion, **When** they open any signed-out page, **Then** the background is still.
3. **Given** a user who chose Board grid, **When** they sign out, **Then** the signed-out pages show the default motion, not their choice, and their choice returns after signing in.

---

### User Story 6 - Ship dark until announced (Priority: P3)

The motion picker and colour selector stay off in production until Rostom announces them, while the new panel look ships as a change to existing screens.

**Why this priority**: release control; it adds no user value by itself.

**Independent Test**: with `appearance.motion` off, Settings shows no Background motion group, every screen shows the still ground, and a saved preset is kept but not applied; with it on, the saved preset applies.

**Acceptance Scenarios**:

1. **Given** the flag is off, **When** a user opens Settings › Appearance, **Then** no Background motion or Motion colour controls are shown and the background is still.
2. **Given** the flag is turned on for a user who saved a preset earlier, **When** they sign in, **Then** their saved preset is applied.

### Edge Cases

- A stored preset name that is no longer offered (renamed or removed later) falls back to Particles and does not error.
- A stored custom colour that is not a valid colour falls back to Signal mint.
- A custom colour that is very light or very dark is still shown, but the tint strength is limited so text contrast holds; the user is not blocked from choosing it.
- Saving the preset fails (offline, server error): the preview stays on the chosen preset, an error with a retry is shown near the picker, and the previous saved value is what other devices see. Error copy branches on the error code.
- The theme switches from light to dark while Settings is open: the colour row disappears without losing the light-mode choice.
- Very long screens: the background covers the whole scrolling page, not just the first screenful, and does not move with scroll.
- Printing a screen: the background layer is not printed.
- Low-power or low-end devices: if the browser reports the device is in a data or power saving mode, the motion behaves as reduced motion.
- A signed-in user's choices never leak onto signed-out pages, which always show the defaults.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Settings › Appearance MUST offer a "Background motion" choice of exactly five stored presets: None, Aurora drift, Board grid, Particles and Grain, each with a visible name and a one-line description.
- **FR-002**: The default preset for a user who has not chosen one MUST be Particles.
- **FR-003**: The chosen preset MUST be saved to the user's account and applied on every signed-in screen on every device the user signs in on.
- **FR-004**: Changing the preset MUST update the background immediately, without a page reload.
- **FR-005**: The preset and colour controls MUST be operable by keyboard and expose their selected state and name to assistive technology; every control MUST be at least 44 × 44 px.
- **FR-006**: In light mode, Settings › Appearance MUST show a "Motion colour" selector with six stored swatches (Signal mint #7fd1a8, Platform blue #8fb3ff, Lamp amber #f5c27a, Dusk violet #c9a7ff, Coral #ff9fb2, Silver #e9edf2) and a custom colour; the default is Signal mint.
- **FR-007**: In dark mode the Motion colour selector MUST be hidden and the moving layer MUST use a fixed dark-tuned tint; the user's light-mode colour MUST be kept and restored on returning to light.
- **FR-008**: The chosen motion colour MUST be saved to the user's account alongside the preset.
- **FR-009**: Every signed-in screen MUST present content on raised translucent panels with 16 px corners over the background layer, falling back to an opaque surface of the same colour where translucency is not supported.
- **FR-010**: Panels MUST reflow by screen width: one column at phone width (360 px), two columns at tablet width (768 px), the full grid on desktop, with content no wider than 1160 px; no signed-in screen may scroll horizontally at 360, 768 or 1280 px wide, apart from wide tables inside their own scroll box.
- **FR-011**: Under a system request for reduced motion, every preset MUST show a still frame with no movement.
- **FR-012**: The background animation MUST pause while the page is hidden and resume when it is shown.
- **FR-013**: The background layer MUST never receive pointer, touch or keyboard input, never sit above content, not scroll with the page content, and not print.
- **FR-014**: Every text pair on every signed-in screen MUST meet WCAG AA contrast in both themes over every preset and over every stored and custom colour, measured at the background's most saturated frame.
- **FR-015**: The Background motion, Motion colour, Translucent panels and Pause background motion controls and the moving layer MUST be gated by the `appearance.motion` feature flag, off in production until announced; with the flag off the background is still, panels are translucent, and saved choices are kept but not applied. The panel look itself (FR-009, FR-010) ships unflagged.
- **FR-016**: An unknown stored preset MUST fall back to Particles and an invalid stored colour to Signal mint, without an error shown to the user.
- **FR-017**: A failed save of the preset or colour MUST show an error next to the picker with a retry action, with copy that depends on the error code.
- **FR-018**: Each user MUST only ever read and change their own appearance choices; the ownership matrix test covers the appearance endpoints for user A × user B.
- **FR-019**: The new identity MUST keep the existing rules that are not about look: three theme states (light, dark by system, dark by choice), tabular figures for every amount, status colours never reused as chart series or motion tints, skeleton, empty and error states on every panel.
- **FR-020**: Signed-in performance and accessibility scores on `/` and `/settings` MUST NOT fall below their current recorded values with Particles or Aurora drift (the costliest preset) selected, and the accessibility score MUST stay at or above 95.
- **FR-021**: Signed-out pages (sign-in, sign-up, password reset, landing) MUST use the same panels and reflow rules and show the default motion (Particles; Signal mint in light, the fixed dark tint in dark), never a signed-in user's choices; the landing page MUST keep performance ≥ 90 and accessibility ≥ 95.
- **FR-022**: Settings › Appearance MUST offer a "Translucent panels" switch, on by default and saved to the account; off shows opaque panels of the same colour on every screen.
- **FR-023**: Settings › Appearance MUST offer a "Pause background motion" switch, off by default and saved to the account; on shows the chosen preset's still frame on every screen, independently of the system reduced-motion setting (which always forces stillness).

### Key Entities

- **Appearance preference (per user)**: the user's background preset (one of the five stored names), light-mode motion colour (one of the six stored swatches or a custom colour), translucent panels (on/off) and pause motion (on/off). Belongs to exactly one user; defaults to Particles, Signal mint, on, off.
- **Motion preset (stored, read-only)**: name, description, its still frame and its default light and dark tints. Shipped with the app, not edited by users.
- **Motion colour swatch (stored, read-only)**: name and colour value; six of them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find and change the background motion from any signed-in screen in under 20 seconds and three interactions or fewer.
- **SC-002**: 100 % of signed-in routes show the chosen preset after a reload and on a second device signed in as the same user.
- **SC-003**: 0 routes, signed-in or signed-out, scroll horizontally at 360, 768 and 1280 px wide, in either theme.
- **SC-004**: 100 % of text pairs pass WCAG AA on every route, for each of the five presets × six stored colours × two themes × translucent and opaque panels, and for the lightest and darkest custom colour.
- **SC-005**: With reduced motion requested, two screenshots of any route taken 3 seconds apart are identical for every preset.
- **SC-006**: Signed-in performance scores on `/` and `/settings` are no lower than before this feature (`/` ~0.69, `/settings` ~0.86 as recorded in spec 004), and accessibility stays ≥ 0.95, with Particles selected.
- **SC-007**: The owner signs off the new look on every screen at phone and desktop width against the approved direction board.

## Assumptions

- The approved direction board (https://claude.ai/artifact/NHdkria1bTDsVYGyW1TXE8, version 4) is the visual reference for panels, spacing and the five presets; it is a direction, and the root `DESIGN.md` rewritten for ADR-0007 becomes normative.
- ADR-0007 supersedes ADR-0006 and the constitution's Principle VI is amended (identity reference, and the "nothing loops" rule replaced by the opt-in background exception) before any implementation task merges.
- Per the constitution, a change to the look of existing screens needs no flag, so the new panel look ships unflagged (confirmed 2026-10-16); the four appearance controls and the moving layer sit behind `appearance.motion`. With the flag off, translucent panels sit over the still ground.
- Typography (system UI words, system mono figures) and the accent presets behind `appearance.accent` carry over unchanged; the accent and the motion colour are separate choices.
- The fixed dark tint is Signal mint at a strength tuned for dark backgrounds.
- The appearance choices are stored the same way as the existing accent preset; no new third-party service or dependency is needed, and everything must keep passing the Workers build check.
- The existing one-time motions from spec 004 (arrival flip, settle-in, list travel, hover lift) are kept.
