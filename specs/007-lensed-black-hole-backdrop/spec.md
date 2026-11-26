# Feature Specification: Event horizon background (lensed black hole)

**Feature directory**: `specs/007-lensed-black-hole-backdrop`
**Created**: 2026-11-26
**Status**: Draft
**Input**: "Write a plan for implementing WebGL shader (real light bending) using speckit and do the full steps till we have tasks and for any question search about it and apply the answer with respect to design first then performance"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a moving black hole as the background (Priority: P1)

A person opens Settings › Appearance and sees a sixth background preset, "Event horizon", beside Aurora drift, Board grid, Particles and Grain. They pick it, and behind the panels a black hole appears: a dark shadow, a thin glowing disc around it, and the far side of the disc bent up over and under the shadow by gravity, as real light would bend. The disc turns slowly and smoothly, inner edge faster than outer. The panels, figures and text stay as readable as they are over any other preset.

**Why this priority**: it is the feature. Everything else protects it.

**Independent Test**: with the preset chosen on a desktop browser, the background shows the shadow, the disc and its lensed image above and below the shadow, and the disc visibly moves over ten seconds.

**Acceptance Scenarios**:

1. **Given** the feature is on for the account, **When** the person picks "Event horizon" in Settings › Appearance, **Then** the background changes at once, the choice is saved, and it is still chosen after a reload and on another device.
2. **Given** "Event horizon" is the background, **When** the person watches for ten seconds, **Then** the disc moves continuously with no visible stutter on a mid-range laptop and phone.
3. **Given** "Event horizon" is the background, **When** any screen is shown in light, dark or system theme, **Then** every text pair still meets the contrast the other presets meet (4.5:1 body, 3:1 large).
4. **Given** the image is drawn, **When** its proportions are measured, **Then** the shadow's size relative to the disc matches what real light bending predicts (see SC-004), and the side of the disc moving toward the viewer is brighter than the side moving away.

---

### User Story 2 - It stops whenever the person or the device asks (Priority: P1)

The black hole behaves like every other preset: it holds still when the person presses "Pause background motion", when the system asks for reduced motion or reduced data, and when the tab is hidden. Holding still means one finished still image, not a blank screen.

**Why this priority**: DESIGN.md and the constitution require it of every background loop. Without it the preset cannot ship.

**Independent Test**: with the preset chosen, toggle each of the four stop conditions and confirm the image freezes and no further frames are drawn while it holds.

**Acceptance Scenarios**:

1. **Given** the preset is moving, **When** the person turns on "Pause background motion", **Then** the image holds its current frame and no frames are drawn until it is turned off.
2. **Given** reduced motion or reduced data is set, **When** any page loads, **Then** the black hole shows as one still image and never animates.
3. **Given** the preset is moving, **When** the tab is hidden and shown again, **Then** no frames are drawn while hidden and the motion resumes smoothly where it was.

---

### User Story 3 - Devices that cannot draw it still get a good background (Priority: P2)

On a device with no 3D drawing support, or one too slow to keep it smooth, the person still sees a calm black hole picture rather than a broken or juddering background, and the rest of the app is not slowed down.

**Why this priority**: design first, then performance. A weak device must never get a worse app because of a background.

**Independent Test**: with 3D drawing disabled in the browser, the preset shows a still drawn black hole; on a throttled device the preset lowers its own detail and, if still too slow, holds a still image.

**Acceptance Scenarios**:

1. **Given** the browser cannot draw in 3D, **When** the preset is chosen, **Then** a still drawn black hole is shown and nothing errors.
2. **Given** the device cannot keep the motion smooth, **When** the preset has run for a few seconds, **Then** it lowers its detail, and if that is not enough it holds a still image.
3. **Given** the drawing is lost (the browser drops the graphics context), **When** it comes back, **Then** the motion resumes; if it does not come back, the still drawing shows.

---

### User Story 4 - A preview in Settings (Priority: P3)

The Settings radio for "Event horizon" shows a small still thumbnail like the other presets, with a one-line description.

**Why this priority**: consistency with the existing picker; the person can choose without trying each preset.

**Independent Test**: the Settings preset list shows six options, each with a thumbnail and one line.

**Acceptance Scenarios**:

1. **Given** the feature is on, **When** Settings › Appearance opens, **Then** "Event horizon" is listed with a still thumbnail and the line "A black hole bending the light of its own disc".

### Edge Cases

- The feature flag is turned off while a person has the preset saved: the background falls back to the warm ground with no motion, and their saved choice is kept for when the flag returns.
- The window is resized or rotated: the image re-frames to the new size without stretching, and the shadow stays round.
- A very wide or very tall screen: the black hole stays centred behind the content and never crowds the figures at 360 px.
- Panels set to opaque, forced colours or print: the same rules as the other presets apply (hidden under forced colours and print).
- The tab stays open for hours: memory and frame time stay flat.
- A person switches presets quickly back and forth: no extra drawing loops pile up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Settings › Appearance MUST offer "Event horizon" as a sixth background preset, behind its own feature flag, with a still thumbnail and the line "A black hole bending the light of its own disc".
- **FR-002**: The chosen preset MUST be saved on the account like the other presets and restored on every device.
- **FR-003**: The image MUST be computed by tracing light paths around a non-rotating black hole, so the shadow, the thin disc and its lensed image above and below the shadow come from the bending itself, not from a drawn shape.
- **FR-004**: The side of the disc moving toward the viewer MUST be brighter than the side moving away, and the disc MUST dim toward its inner edge from gravitational redshift.
- **FR-005**: The disc MUST turn continuously, inner parts faster than outer, slow enough to stay calm (one inner revolution takes at least 30 seconds).
- **FR-006**: The disc colour MUST follow the person's motion colour, the same way the other presets do, and MUST never use Delay Amber or Cancel Red.
- **FR-007**: Every text pair MUST meet the same contrast over this preset as over the existing presets, in all three theme states and both panel modes.
- **FR-008**: The preset MUST hold one still frame, drawing nothing further, while the person has paused motion, the system asks for reduced motion or reduced data, or the tab is hidden.
- **FR-009**: Where 3D drawing is unavailable, or the graphics context is lost and does not return, a still drawn black hole MUST be shown instead.
- **FR-010**: The preset MUST lower its own detail when frames run late, and MUST hold a still image if the lowest detail still runs late.
- **FR-011**: Nothing for this preset MUST be downloaded or run unless the preset is chosen.
- **FR-012**: The background MUST stay hidden under forced colours and in print, sit behind all content, take no input and be hidden from assistive technology, like the other presets.

### Key Entities

- **Motion preset** *(existing)*: the background a person has chosen. This feature adds one more allowed value; nothing else about it changes.
- **Feature flag** *(existing)*: a new flag gates the new value until it is announced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a mid-range laptop and a mid-range phone, the preset runs at its target frame rate with no more than 1 % of frames late over 60 seconds.
- **SC-002**: With the preset chosen, the signed-in month view keeps its Lighthouse scores (performance at least 90, accessibility at least 95).
- **SC-003**: With the preset not chosen, page weight and load time are unchanged from before the feature.
- **SC-004**: In a still frame with a known framing, the shadow's measured radius is within 3 % of the value real light bending predicts for that framing.
- **SC-005**: The contrast check passes for every text pair over the preset in all three theme states and both panel modes.
- **SC-006**: With any of the four stop conditions set, zero frames are drawn over 5 seconds.
- **SC-007**: After one hour open, memory use and frame time are within 10 % of their values after one minute.

## Non-goals

- A spinning (Kerr) black hole, stars or a background galaxy behind it.
- Recreating the look, name or any frame of a film. The preset is named and drawn as a generic black hole.
- The landing site: it keeps its own fixed background.
- Letting the person tune the black hole (size, angle, speed).

## Change-level rules

- No new runtime dependency: the drawing uses the browser's own 3D drawing.
- Adding the preset changes the stored list of allowed presets through a migration; no existing value changes.
- The existing five presets and their CSS stay as they are.

## Verification plan

1. Unit tests prove the stop conditions, the detail lowering, the fallback and the clean-up on preset change.
2. An end-to-end test in Chromium picks the preset, checks it is saved, checks frames stop under each stop condition, and measures the shadow radius in a still frame (SC-004).
3. Visual baselines of a still frame at 360 and 1280, light and dark.
4. The composite contrast test gains this preset.
5. Lighthouse on the month view with the preset chosen.
6. The owner looks at it on a real phone and laptop and signs off the look.

## Assumptions

- Name "Event horizon" and the Settings line above are defaults; the owner may rename.
- The frame rate target is 30 frames a second: the motion is slow, so 30 looks smooth and halves the cost (research R4).
- The shadow sits centred, slightly above the middle of the screen, seen from just above the disc plane so the lensed far side of the disc arches over the shadow.
- Feature flag name `appearance.event_horizon`, off in production until announced.

## Verbatim Constraints

- Preset id: `event-horizon`
- Settings label: `Event horizon`
- Settings line: `A black hole bending the light of its own disc`
- Feature flag: `appearance.event_horizon`
