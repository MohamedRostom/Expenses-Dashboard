# Research: Event horizon background

Each open question was searched and settled design first, then performance. Sources are listed at the end.

## R1. What the black hole looks like

**Decision**: A non-rotating (Schwarzschild) black hole with a thin disc, seen from about 8 degrees above the disc plane. The lensed far side of the disc arches over and under the shadow. Doppler beaming and gravitational redshift are on, so the side moving toward the viewer is brighter and the inner disc dims.

**Rationale**: The bending is what makes the image, and it falls out of the physics with no drawn shapes (FR-003). The film's renderers switched Doppler beaming off for looks, which made their disc symmetric. Keeping it on is both more accurate and visibly not the film's frame (Non-goals). The Event Horizon Telescope notes that real discs look lopsided for this reason.

**Alternatives considered**: A spinning (Kerr) black hole is more accurate for real astrophysical holes but needs a far heavier integrator, and the difference is invisible at background size. A symmetric disc with no beaming looks like the film, so it is rejected for that reason.

## R2. How light paths are traced

**Decision**: One full-screen triangle with a fragment shader. Each pixel traces its ray using the conserved angular momentum h of the photon: position x, velocity v, acceleration a = -1.5 h² x / |x|⁵ (units where the Schwarzschild radius is 1). Integration is fixed-step velocity Verlet with a larger step far from the hole, checking each step for a crossing of the disc plane (y = 0, 3 < r < 12). A ray inside r < 1 is captured (the shadow). A ray past r > 30 that is moving away escapes (transparent).

**Rationale**: This is the standard browser approach. It reduces each ray to one cheap formula per step, reproduces the photon ring and the critical impact parameter b = 3√3/2 ≈ 2.598, and is testable (SC-004). Verlet is as stable as RK4 here at half the cost per step.

**Alternatives considered**: RK4 costs four times the work per step for no visible gain at this size. Precomputed lookup textures (Bruneton) are faster but add binary assets and a build step. A library (three.js) is a new dependency and is rejected by constitution VI.

## R3. Colour and how it sits over the warm ground

**Decision**: The canvas is transparent everywhere except the shadow and the disc, so the warm ground shows through as space. The shadow is black drawn at a capped alpha. The disc's colour runs from near-white at the hot inner edge to `--motion-tint` at the outer edge, with brightness from the beaming and redshift. The whole canvas has the same kind of per-theme opacity cap as the other presets in DESIGN.md's table, and its values are set by the composite contrast test, never by eye. In dark theme the tint is `MOTION_DARK_TINT`, as for every preset.

**Rationale**: Design first: it keeps the person's motion colour (FR-006) and the rule that the ground is the backdrop. The white-hot core is what real discs do. The cap keeps text AA over the brightest disc pixel and the darkest shadow pixel (FR-007).

**Alternatives considered**: A fixed blackbody orange disc ignores the person's colour and breaks the preset rule in DESIGN.md. An opaque black space background would fight the warm ground and hurt light theme.

## R4. Frame rate and smoothness

**Decision**: Target 30 frames a second, with time-based motion so a dropped frame never makes the disc jump. The inner disc takes 40 seconds per turn, and outer parts slow down Keplerian-fashion (period ∝ r^1.5).

**Rationale**: At this speed, 30 frames a second looks the same as 60 and halves the GPU work. The searched guidance says to cap the loop for decorative visuals.

**Alternatives considered**: An uncapped 60 frames a second doubles battery cost for no visible gain on slow motion.

## R5. Resolution and step budget

**Decision**: The canvas draws at 0.5 of CSS pixel size, ignoring device pixel ratio, and CSS stretches it to the screen. Detail tiers: 96 steps at scale 0.5, then 64 steps at 0.5, then 64 steps at 0.35. If a tier misses the 33 ms budget on more than 10 % of frames over 2 seconds, the next tier is tried. Below the last tier it holds a still frame (FR-010).

**Rationale**: Cost tracks pixel count almost linearly, and the panels blur the background by 24 px anyway, so half resolution cannot be seen through the glass. The searched guidance says to cap device pixel ratio for blurred backgrounds and to lower resolution when frames run late.

**Alternatives considered**: Full device pixel ratio costs 4 to 9 times as much and cannot be seen through blur. An OffscreenCanvas in a worker moves work off the main thread, but the GPU cost is unchanged and it adds a second module. It can be added later if main-thread time shows up in SC-001.

## R6. Stopping and still frames

**Decision**: A small controller owns the loop. It draws one frame and stops when any of these holds: `data-motion-paused` on `<html>` (watched with a MutationObserver), `matchMedia('(prefers-reduced-motion: reduce)')`, `matchMedia('(prefers-reduced-data: reduce)')`, or `document.visibilityState === 'hidden'`. The still frame is the image at time 0, so two screenshots match, the same rule as the CSS presets.

**Rationale**: The CSS rules that stop the other presets cannot stop a script loop. The readers found that `applyMotion` reads only saveData and the user's pause, so the controller reads the media queries itself (FR-008).

**Alternatives considered**: Adding the media queries to `applyMotion` would change the five CSS presets' behaviour for no gain.

## R7. Fallback, thumbnail and loading

**Decision**: One CSS still drawing (radial gradients: a dark disc, a thin bright ring and an arc) serves as the Settings thumbnail, as the no-WebGL fallback and as the fallback after a lost context that does not return within 3 seconds. The WebGL module is a dynamic import, loaded only when `data-motion="event-horizon"`.

**Rationale**: The thumbnails are CSS by convention (R12 of spec 006), and a static image asset would be a download (FR-011). One drawing serves three purposes.

**Alternatives considered**: A WebGL thumbnail would load the module in Settings. A pre-rendered PNG adds a binary asset.

## R8. Flag gating and stored value

**Decision**: Migration 0016 drops and re-adds `users_motion_preset_check` with `event-horizon`, and inserts flag `appearance.event_horizon` with `default_on = false`. The contract adds the id. `App.vue` passes the flag to `applyMotion`, which writes `none` for `event-horizon` while that flag is off, keeping the saved value. Settings shows the option only when the flag is on, and shows None as checked if the saved preset is hidden. The API accepts the value for everyone (the flag is a rollout switch, not a permission).

**Rationale**: It follows the 0012 and 0014 precedent and keeps every existing value valid. Postgres cannot edit a CHECK in place.

**Alternatives considered**: A server-side flag check on PATCH /me adds a route branch for a cosmetic choice.

## R9. Testing WebGL in CI

**Decision**: Unit tests (jsdom) cover the controller with a fake GL context and a fake clock. Shader correctness runs in Chromium in the `ci` and `visual` projects: an e2e test reads back pixels from a still frame and measures the shadow radius (SC-004). The visual baselines use the still frame under reduced motion. Repeat-run stability of the WebGL screenshot in the Playwright container is checked before the baselines are trusted. If SwiftShader output drifts between runs, `--use-angle=swiftshader` is pinned in the visual project's launch arguments.

**Rationale**: Headless Chromium draws WebGL through SwiftShader in the container. The searched sources warn that output can differ across environments, so baselines come from the same container, as the project already requires.

**Alternatives considered**: Mirroring the integrator in TypeScript for unit tests would duplicate the shader logic.

## R10. Design record

**Decision**: Write ADR-0009 "WebGL background preset", which amends DESIGN.md's Background layer rule ("No script loop, canvas, WebGL or dependency") to allow one lazily loaded WebGL preset under the same stop rules. Accepted by Rostom on 2026-11-26. Signed-out pages and the landing site keep Particles.

**Rationale**: DESIGN.md is normative and currently forbids WebGL. Constitution VI allows one opt-in pausable loop, which this still is.

## Sources

- [James et al. 2015, Gravitational lensing by spinning black holes in astrophysics and in Interstellar (arXiv)](https://arxiv.org/abs/1502.03808v1)
- [EHT FAQ: how realistic are movie black holes](https://eventhorizontelescope.org/faq/how-realistic-are-movie-depictions-black-holes-eg-interstellar)
- [APS News interview with Kip Thorne](https://aps.org/publications/apsnews/201412/thorne.cfm)
- [Relativistic raytracing write-up](https://publish.obsidian.md/h1m3/Articles/Relativistic+raytracing)
- [Parallel ray tracing of black hole images, Schwarzschild metric (arXiv)](https://arxiv.org/pdf/2507.16165)
- [Gargantua in WebGL, one draw call (three.js forum)](https://discourse.threejs.org/t/gargantua-a-ray-traced-black-hole-in-my-portfolio-webgl-one-draw-call/94960)
- [Real-time high-quality rendering of non-rotating black holes (arXiv)](https://arxiv.org/pdf/2010.08735)
- [Paper shaders performance notes](https://www.mintlify.com/paper-design/shaders/concepts/performance)
- [MDN WebGL best practices](https://developer.mozilla.org/docs/Web/API/WebGL_API/WebGL_best_practices)
- [three.js forum: automatically scaling WebGL apps](https://discourse.threejs.org/t/how-do-you-automatically-scale-your-webgl-applications/3592)
- [WebGL without a GPU (Microlink)](https://microlink.io/blog/webgl-without-a-gpu)
- [Playwright visual determinism across environments](https://camoa.github.io/dev-guides/testing/visual-regression/playwright/pw-vr-determinism/)
