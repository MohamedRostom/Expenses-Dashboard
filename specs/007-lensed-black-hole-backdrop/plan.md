# Implementation Plan: Event horizon background

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## Summary

Add a sixth motion preset, `event-horizon`, that draws a physically lensed, non-rotating black hole with a WebGL fragment shader. Each pixel traces its light ray around the hole (R2), with Doppler beaming and redshift on (R1). The shader is a lazily loaded module mounted by `BackgroundMotion.vue` only when `data-motion="event-horizon"`. A small controller runs it at 30 frames a second at half resolution, lowers its own detail when frames run late, and holds a still frame under the same four stop conditions as the CSS presets (R4 to R6). A CSS still drawing doubles as thumbnail and fallback (R7). The value is stored like the other presets through migration 0016, behind flag `appearance.event_horizon` (R8). No new dependency: raw WebGL 1, so it runs wherever the browser has WebGL.

## Project Structure

```text
packages/contracts/src/motion.ts                  ~ add 'event-horizon' to MOTION_PRESET_IDS
packages/contracts/openapi.json                   ~ regenerated
packages/db/migrations/0016_event_horizon.sql     + widen users_motion_preset_check, insert flag (off)
packages/db/migrations/meta/_journal.json         ~ entry 16
packages/db/src/flags.ts, seed.ts                 ~ appearance.event_horizon
packages/ui/src/components/BackgroundMotion.vue   ~ mount point, CSS still drawing, thumbnail
packages/ui/src/motion/eventHorizon.ts            + controller: loop, stop conditions, tiers, fallback
packages/ui/src/motion/eventHorizon.glsl.ts       + vertex and fragment shader sources
apps/web/src/views/theme.ts                       ~ event-horizon becomes none while its flag is off
apps/web/src/App.vue                              ~ pass the new flag
apps/web/src/components/appearance/AppearanceSettings.vue  ~ label, blurb, flag filter
tests/e2e/tests/event-horizon.spec.ts             + save, stop conditions, shadow radius (SC-004)
tests/e2e/tests/visual.spec.ts                    ~ still-frame baselines
docs/adr/ADR-0009-webgl-background-preset.md      + amends DESIGN.md Background layer
DESIGN.md, CLAUDE.md, CHANGELOG.md                ~ preset table, rule, flag note
```

**Structure Decision**: The renderer lives in `packages/ui` beside `BackgroundMotion.vue`, which owns the background layer. The web app only writes attributes on `<html>`, as it does today.

## Call paths

```calls choosing the preset
  App.vue motion watch @ apps/web/src/App.vue:76
~   applyMotion() writes data-motion @ apps/web/src/views/theme.ts:93
~   BackgroundMotion.vue reads data-motion @ packages/ui/src/components/BackgroundMotion.vue:8
+     startEventHorizon(canvas) **new** @ packages/ui/src/motion/eventHorizon.ts
+       compile(fragmentSource) **new** @ packages/ui/src/motion/eventHorizon.glsl.ts
```
note: Nothing past `BackgroundMotion.vue` loads unless the attribute names the preset (FR-011).

```calls stopping and resuming
  applyMotion() toggles data-motion-paused @ apps/web/src/views/theme.ts:98
+   MutationObserver(html), controller.update() **new** @ packages/ui/src/motion/eventHorizon.ts
+   matchMedia(reduced motion, reduced data), controller.update() **new** @ packages/ui/src/motion/eventHorizon.ts
+   visibilitychange, controller.update() **new** @ packages/ui/src/motion/eventHorizon.ts
```

## States

```states renderer lifecycle
Loading: Module and shader being prepared. (start)
Moving: Drawing at 30 frames a second.
Still: One frame drawn, loop stopped.
Fallback: CSS still drawing shown. (final)
Gone: Preset changed, everything released. (final)
Loading -> Moving: compiled, no stop condition
Loading -> Still: compiled, a stop condition holds
Loading -> Fallback: no WebGL or compile fails
Moving -> Still: paused, reduced motion or data, hidden, or lowest tier late
Still -> Moving: every stop condition cleared
Moving -> Fallback: context lost over 3 s
Moving -> Gone: data-motion changes
grid:
Loading | Moving | Gone
.       | Still  | Fallback
```
note: From every state, a change of `data-motion` releases the context and listeners and goes to Gone; a restored context returns to Loading.

## Screens

```screen settings Settings, Appearance, Background motion
title: Background motion
list: None | Aurora drift | Board grid | Particles | Grain | Event horizon (new) (1)
text: A black hole bending the light of its own disc (new) (2)
```
1: **Behind its flag.** The option shows only while `appearance.event_horizon` is on; if a saved choice is hidden, None shows as checked.
2: **CSS thumbnail.** The same still drawing as the fallback, so Settings loads no WebGL.

## Constitution Check

| Principle | Assessment |
|---|---|
| I to V (product, isolation, testing, data, security) | PASS: one more allowed value in an existing column; ownership unchanged; tests before code at every layer; no secrets, no new route. |
| VI Simplicity and Finished Surfaces | PASS with an ADR: still exactly one opt-in, pausable background loop; no dependency; behind a flag until announced. DESIGN.md's "No script loop, canvas, WebGL" line is amended by ADR-0009 (see Complexity Tracking). |
| Platform (Workers compatibility) | PASS: browser-only code; the API and worker build are untouched apart from the shared contract list. |

### Complexity Tracking

| Violation | Why needed | Simpler alternative rejected |
|---|---|---|
| A script loop and WebGL in the background layer, which DESIGN.md forbids | Real light bending must be computed per pixel (FR-003) | The plain CSS version cannot bend light, which is the request |
| A second module in `packages/ui` | Keeps the shader out of every bundle until chosen (FR-011) | Inlining it in `BackgroundMotion.vue` ships it to everyone |

Re-checked after Phase 1: no design document changed a gate.
