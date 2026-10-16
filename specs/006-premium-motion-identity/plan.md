# Implementation Plan: Premium Identity with Background Motion

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md) · **Data model**: [data-model.md](./data-model.md) · **Contracts**: [contracts/](./contracts/)

**Scale note**: the change touches every screen through shared tokens and components, so most screens need no edit, but every visual baseline (web and landing) is regenerated. Watch three places: the contrast test that guards every preset × colour combination, the public flags endpoint (it must never list more than its allowlist), and the performance budgets, which are already under target on two signed-in routes.

## Summary

Every screen, signed in and out, moves to translucent 16 px panels over an ambient background layer that reflows by width. With `appearance.motion` on, Settings › Appearance offers five motion presets, a light-only motion colour, a translucent-panels switch and a pause switch, all saved to the user's row the same way as the accent preset. The motion is a CSS-only layer that animates transform and opacity and stops under reduced motion, reduced data, a hidden tab or the user's pause. Its contrast is proved by a composited-colour unit test rather than by limiting the user's colour. No new dependency.

## How it fits together

`App.vue` already watches the session and flags to call `applyTheme` and `applyAccent`. A new `applyMotion(prefs, enabled, theme)` in `apps/web/src/views/theme.ts` joins that watch and sets `data-motion`, `data-motion-paused`, `data-panels` and the `--motion-tint` custom property on `<html>`. `BackgroundMotion.vue`, mounted once in `App.vue` behind `<RouterView>`, reads only those attributes, so it takes no props. Signed out, `App.vue` reads `GET /flags/public` instead of `GET /flags`. The landing site mounts the same component at build time when `VITE_APPEARANCE_MOTION` is `true`.

## Project Structure

```text
packages/contracts/src/motion.ts            NEW  preset ids, swatches, dark tint
packages/contracts/src/{auth,me}.ts         EDIT four fields on UserResponse / PatchMeRequest
packages/contracts/openapi.json             REGEN
packages/db/src/schema.ts                   EDIT four users columns
packages/db/migrations/0012_user_motion.sql NEW  columns + CHECKs
packages/db/src/seed.ts                     EDIT appearance.motion flag
apps/api/src/routes/me.ts, auth.ts          EDIT map and patch the fields
apps/api/src/routes/misc.ts                 EDIT GET /flags/public (allowlist)
packages/ui/src/tokens.css                  EDIT glass surface, blur, radius-xl, motion alphas
packages/ui/src/motion.css                  NEW  five presets' keyframes, pause and reduced-motion rules
packages/ui/src/components/BackgroundMotion.vue  NEW
packages/ui/src/components/PanelFrame.vue (+ tile/widget frames)  EDIT .surface rule
packages/ui/src/contrast.ts                 EDIT compositeOver()
apps/web/src/views/theme.ts                 EDIT applyMotion()
apps/web/src/App.vue                        EDIT mount layer, watch prefs, public flags when signed out
apps/web/src/views/SettingsView.vue         EDIT Appearance controls
apps/web/src/views/*.vue                    EDIT only screens with their own column rules → .board-grid
apps/landing/src/App.vue                    EDIT mount layer at build time
DESIGN.md, docs/adr/ADR-0007-premium-identity.md, .specify/memory/constitution.md  identity documents
tests/e2e/tests/motion.spec.ts              NEW  picker, persistence, pause, reduced motion, reflow, isolation
```

**Structure decision**: all look and motion live in `packages/ui` (tokens, one CSS file, one component). Screens only swap their own column rules for `.board-grid`, so the drift scan stays green.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Test-First | PASS. Each slice opens with its failing test: contract tests for the ids and colour regex, a migration test on Testcontainers, API tests for `PATCH /me` and `/flags/public`, a contrast unit test over the full matrix, a `theme.ts` attribute test, and the e2e `motion.spec.ts` with axe. |
| II. One Codebase, Two Runtimes | PASS. No dependency; CSS plus one Hono route; `worker-build` unaffected. |
| III. Money Is Exact | PASS. No money path changes; figures keep tabular mono. |
| IV. Every User Is an Island | PASS. The columns sit on the caller's own row behind `PATCH /me`, and the ownership matrix asserts it. `/flags/public` exposes no user data and only its allowlist. |
| V. Decide Once, Write It Down | PASS once ADR-0007 and the constitution amendment are accepted; both are the first tasks. |
| VI. Simplicity and Finished Surfaces | **Amendment needed.** Principle VI names ADR-0006's identity, and `DESIGN.md` forbids looping effects. ADR-0007 and constitution v1.3.0 replace the identity reference and allow exactly one loop, the opt-in background. The look change ships unflagged as 1.1.1 allows; the controls sit behind `appearance.motion`. |

### Complexity Tracking

| Exception | Why it is needed | Simpler alternative rejected |
|---|---|---|
| A looping background effect | The owner chose ambient motion as the new identity (2026-10-16) | A still background: rejected by the owner |
| A public, unauthenticated flags endpoint | Signed-out pages must respect the flag (FR-021, FR-015) | Making `GET /flags` public leaks every flag name |
| Signed-in Lighthouse performance stays under 0.9 (CLAUDE.md definition of done says "Lighthouse green") | Spec 004 left `/` ~0.69 and `/settings` ~0.86 with assertions at `warn`; this spec promises no regression, not the fix | Fixing signed-in performance here would double the scope; it stays a separate item |

Re-checked after Phase 1 design: no new violation.

## Risks

- **Performance**: `backdrop-filter` on many panels can cost on low-end phones. The opaque switch and the `@supports` fallback cover users; CI measures `/` and `/settings` with Particles against the spec 004 numbers.
- **Visual baselines**: every snapshot changes. Regenerate once per slice at `--workers=2` (spec 004's stable setting), never with the `manual` project.
- **Spec 004 is unmerged** (PR #26). This branch builds on `phase-4/ui-baselines` and must rebase once it lands.
