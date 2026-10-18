# ADR-0007: Premium identity with ambient motion

**Status:** Accepted (2026-10-16)
**Date:** 2026-10-16 (proposed and accepted)
**Deciders:** Rostom (owner)
**Supersedes:** ADR-0006 (Concourse Board)
**Relates to:** `DESIGN.md`, `specs/006-premium-motion-identity/spec.md`, `.specify/memory/constitution.md` Principle VI, direction board https://claude.ai/artifact/NHdkria1bTDsVYGyW1TXE8 (version 4)

## Acceptance

Accepted by the owner on 2026-10-16 (spec 006 T004), together with constitution 1.3.0 and the rewritten `DESIGN.md`. The owner also confirmed the drafted values: Glass opacity 72 % light and 62 % dark with a 20 px blur, 16 px panel corners, the background alpha ceilings in `DESIGN.md` § Motion, Lamp amber as a background-only swatch, the retired departure-tile seam, an opaque header, dialogs, menus, sheets and toasts, FR-020 measured on `/` and `/settings`, and signed-in Lighthouse performance held at no regression rather than 0.9.

Amended 2026-10-17 (spec 006 Phase 8b): the owner found the build fainter than the approved direction board, so the board is the reference for values. Glass follows the board (white 66 % light, `rgb(21 26 33)` 58 % dark, `saturate(140%)`), raised by the contrast test to 68 % and 66 %; the background alphas are the board's at its 70 % intensity, and dark Aurora uses a deep blue and a deep amber. The capped-alpha structure and the contrast test are unchanged. Values live in `DESIGN.md`.

## Context

ADR-0006 made Desk a rail departure board: opaque flaps on a steel ground, crisp 2/4/8 px corners, and a rule that nothing loops except the skeleton pulse. Six days after it was accepted the owner asked for a more premium look with a background that moves, chosen by the user. A direction board (2026-10-16) put four motion families and a surface treatment side by side on the month view in both themes. The owner reviewed it and decided to replace the Concourse Board identity rather than layer motion on top of it, because a moving layer behind opaque flaps is invisible and a board that refuses to loop cannot carry one.

Spec 006 records the decisions in detail and its clarify round settled four more (2026-10-16): the panel look ships unflagged, signed-out pages share it with a fixed default motion, and two account switches let a user turn panels opaque or pause the motion.

## Decision

Adopt "Premium identity with ambient motion" as the visual identity of Desk, as written in the root `DESIGN.md`. The delta the owner approves:

| Decision | ADR-0006 (Concourse Board) | ADR-0007 |
|----------|----------------------------|----------|
| Surfaces | Opaque flaps, two shadow heights | Translucent (frosted) panels: white at 68 % (light) or `rgb(21 26 33)` at 66 % (dark) opacity with a 20 px backdrop blur and `saturate(140%)`, over the ground; opaque fallback of the same colour where blur is unsupported or the user turns it off |
| Panel corners | 4 px tiles and panels, 8 px dialogs | 16 px on panels, tiles and widget frames (`--radius-xl`); controls keep 2 px, dialogs 8 px |
| Ground | A still steel ground | The same ground with one opt-in ambient layer behind every screen |
| Looping | Nothing loops except the skeleton pulse | Exactly one looping effect, the background layer; everything else keeps the spec 004 one-time rules |
| Layout | Board columns that step at 360/768/1024 | Panels reflow: one column at 360, two at 768, the full grid on desktop, content at most 1160 px; tables keep fixed columns inside their own scroll box |
| Character | Concourse Board: legible, ordered, live, calm | Premium and calm: the figures stay the loudest thing on the screen; the background is felt, not read |

The background layer:

- **Five presets**, chosen in Settings › Appearance and saved on the account: None, Aurora drift, Board grid, Particles (the default) and Grain.
- **Motion colour** in light mode only: six swatches (Signal mint `#7fd1a8` default, Platform blue `#8fb3ff`, Lamp amber `#f5c27a`, Dusk violet `#c9a7ff`, Coral `#ff9fb2`, Silver `#e9edf2`) or a free custom colour. Dark mode always uses Signal mint at a dark-tuned strength; the light choice is kept and restored.
- **Two switches**, saved on the account: "Translucent panels" (on by default) and "Pause background motion" (off by default).
- **Stillness**: the layer shows its first frame when the user pauses it, the system asks for reduced motion or reduced data, or the tab is hidden. It never takes input, never sits above content, does not scroll with the page and does not print.
- **Signed-out pages** (sign-in, sign-up, reset, landing) show the default motion and never a user's choices.
- **Release**: the panel look is a change to existing screens and ships unflagged (constitution 1.1.1); the four controls and the moving layer sit behind `appearance.motion`, off in production until the owner announces it.

Carried over unchanged from ADR-0006: the system UI and system mono type stacks with tabular figures and small spaced capitals; Signal Green as the default accent and the five accent presets behind `appearance.accent`; the three theme states; Focus Blue; Delay Amber and Cancel Red, which are never a chart series and never a motion tint; the account palette; hand-written single-hue SVG charts; the departure tile as the largest figure; row lamps paired with words; the arrival flip, settle-in, list travel, bar growth and hover lift with their 280 ms ceiling.

Dropped from ADR-0006: the departure tile's flap-cell seam, the "flap" vocabulary for surfaces and the "nothing loops" rule.

## Consequences

- Principle VI of the constitution names ADR-0006's identity, so it is amended in the same change (1.2.0 → 1.3.0): the identity clause names this ADR and allows exactly one looping effect, the opt-in background layer. ADR-0006 is marked Superseded. Only the owner merges either.
- Contrast is protected by structure, not by rejecting colours: the tint is drawn at capped alphas and panels keep a minimum opacity, and a unit test composites every preset × swatch × the lightest and darkest custom colour × both themes × both panel modes and asserts every text pair stays at or above 4.5:1 (spec 006 SC-004).
- Motion is CSS only, animating `transform` and `opacity` on one fixed layer. No dependency, so the `worker-build` job is unaffected.
- `backdrop-filter` costs paint on low-end phones. The opaque switch and the `@supports` fallback cover users; CI measures `/` and `/settings` with Particles and Aurora drift against the spec 004 numbers, and signed-in performance is promised not to regress rather than to reach 0.9 (spec 006 plan, Complexity Tracking).
- Four columns join `users` and travel through the existing `PATCH /me`, like `accent`. Signed-out pages read a new unauthenticated `GET /flags/public` that lists only `appearance.motion`; the static landing page takes the flag at build time.
- Every visual baseline, web and landing, is regenerated once.
- The Lamp amber swatch (`#f5c27a`) sits in the 0 to 60 degree hue range that accent presets avoid. It is allowed here because it tints only the background at a capped alpha and is never used for a status, a series or an accent; status amber stays `#8a5a00` / `#ffb000`.

## Alternatives considered

- **Layer motion over the Concourse Board.** Keeps ADR-0006 and adds an effect. Rejected by the owner: opaque flaps hide the layer, and the board's character rules out a loop.
- **A still premium surface without motion.** Rejected by the owner; the motion is the point of the change.
- **Canvas or WebGL particles.** More realistic, but a per-frame script loop costs battery and Lighthouse TBT on routes already under budget.
- **One fixed motion for everyone.** Rejected by the owner, who wanted the choice on the account.
- **Rejecting low-contrast custom colours.** Blocks a free choice for a decorative layer; capping the tint alpha bounds the worst case instead.
