# Research: Premium Identity with Background Motion

Each entry is a decision the codebase did not already settle.

## R1. How the motion is drawn

**Decision**: CSS only. One fixed-position layer (`BackgroundMotion.vue` in `packages/ui`) behind the app root, `pointer-events: none`, `z-index` below content, hidden in `@media print`. Each preset is a set of `@keyframes` that animate only `transform` and `opacity`, the same technique as the direction board (blurred blobs for Aurora, a translating 48 px line pattern for Board grid, two translating radial-gradient dot tiles for Particles, an inline SVG `feTurbulence` rect stepping its position for Grain).

**Rationale**: compositor-only animation keeps main-thread cost near zero, which is what FR-020 needs with signed-in performance already under 0.9. No dependency, so the Workers build is unaffected. The board proved all four look right this way, Particles included.

**Alternatives considered**: canvas or WebGL particles (more realistic, but a per-frame script loop costs battery and Lighthouse TBT); a motion library (a dependency for what keyframes already do).

## R2. Pausing when hidden, reduced motion and the user pause

**Decision**: one attribute on `<html>`, `data-motion-paused`, set when `document.visibilityState === 'hidden'` or the user's `motionPaused` is true. CSS sets `animation-play-state: paused` under that attribute, and `animation: none` under `prefers-reduced-motion: reduce` and under `prefers-reduced-data: reduce` (where supported). The still frame is each preset's 0 % keyframe, which is also what `animation: none` shows.

**Rationale**: a single attribute keeps the rule in CSS, testable by toggling the attribute. `animation: none` and a paused animation both render a stable frame, so SC-005's two-screenshot check holds.

**Alternatives considered**: removing the layer when paused (a visible jump to the plain ground, and it re-mounts on resume).

## R3. Where the four choices are stored

**Decision**: four new columns on `users`, mirroring `accent` (migration `0012_user_motion.sql`): `motion_preset text NOT NULL DEFAULT 'particles'` with a CHECK of the five ids, `motion_colour text NOT NULL DEFAULT '#7fd1a8'` with a CHECK `~ '^#[0-9a-f]{6}$'`, `panels_translucent boolean NOT NULL DEFAULT true`, `motion_paused boolean NOT NULL DEFAULT false`. They travel on `UserResponse` and change through the existing `PATCH /me`.

**Rationale**: the accent preset set this pattern (column + CHECK + zod enum + `PATCH /me`), with ownership enforced by `/me` being the caller's own row, so FR-018 reuses the existing matrix row. No new table for four scalars.

**Alternatives considered**: a `user_preferences` JSON column (no database-level validation, and a second pattern beside `accent`); a separate `/me/appearance` route (a second write path for one row).

## R4. The custom colour and contrast

**Decision**: store any lowercase `#rrggbb`. Contrast is protected structurally, not by rejecting colours: the moving layer's tint is capped at a fixed alpha per theme (light 0.35 for dots and lines, 0.55 for Aurora fields), and panel surfaces stay at ≥ 0.66 opacity in light and ≥ 0.58 in dark over it. `packages/ui/src/contrast.ts` gains a `compositeOver()` helper so a unit test computes the worst-case composited ground under a panel for five presets × six swatches × lightest (`#ffffff`) and darkest (`#000000`) custom colour × both themes × both panel modes, and asserts every text token pair stays ≥ 4.5:1 (SC-004).

**Rationale**: the owner asked for a free choice. Capping alpha bounds the worst case, so a test over the extremes covers every colour in between.

**Alternatives considered**: rejecting low-contrast colours (blocks a free choice for a decorative layer); auto-adjusting the user's colour (the saved value would differ from what they picked).

## R5. Signed-out pages and the flag

**Decision**: add `GET /flags/public`, unauthenticated, returning the global value of an allowlist that holds only `appearance.motion`. The web app's signed-out routes read it and always use the defaults (Particles, Signal mint, translucent, not paused). The landing site is static (`vite-ssg`) on another origin, so it renders the motion layer at build time from `VITE_APPEARANCE_MOTION`, which the deploy workflow sets from the flag's production value; off by default.

**Rationale**: `GET /flags` requires a session and resolves per-user overrides, which signed-out pages cannot have. An allowlist keeps the public endpoint from exposing unannounced flag names. A build-time switch keeps the landing page free of a runtime API call, protecting its performance ≥ 90 budget.

**Alternatives considered**: making `GET /flags` public (leaks every flag name); always showing motion on signed-out pages (breaks FR-015).

## R6. Translucent panels and their fallback

**Decision**: new surface tokens in `packages/ui/src/tokens.css`, `--color-surface-glass` and `--blur-surface` (20 px), applied by `PanelFrame` and the tile and widget frames through one `.surface` rule. `@supports not (backdrop-filter: blur(1px))` and `:root[data-panels="solid"]` both fall back to `--color-surface-raised`. Panels take a new `--radius-xl: 16px`; controls keep their current radii.

**Rationale**: one rule in the component layer means screens never carry colour or blur, which keeps the drift scan rule ("screen files hold layout only") true.

**Alternatives considered**: per-screen styles (fails the drift scan and repeats the rule across 20 files).

## R7. Reflow

**Decision**: one shared layout rule in `packages/ui` (`.board-grid`: `grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))`, `max-width: 1160px`) for screens that set their own columns today; tile rows keep `minmax(220px, 1fr)`. Wide tables stay inside `DataTable`'s scroll box. The e2e `ci` project asserts `scrollWidth <= clientWidth` on every route at 360, 768 and 1280.

**Rationale**: `min(100%, 320px)` gives one column at 360, two at 768 and the full grid on desktop without breakpoints. A scroll-width assertion tests SC-003 directly.

**Alternatives considered**: per-screen media-query breakpoints (more rules, same result).

## R8. Identity documents

**Decision**: ADR-0007 "Premium identity with ambient motion" supersedes ADR-0006; the constitution moves to v1.3.0, rewording Principle VI's identity clause to name ADR-0007 and allowing exactly one looping effect, the opt-in background layer. The root `DESIGN.md` is rewritten for the new identity, keeping the spec 004 one-time motions and adding the background rules. All three are owner-accepted before any code task merges.

**Rationale**: CLAUDE.md requires an ADR for a decision change, and Principle VI currently names ADR-0006 and forbids loops.
