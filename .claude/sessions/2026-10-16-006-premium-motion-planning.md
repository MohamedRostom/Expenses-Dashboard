# Session handoff — 2026-10-16 — spec 006 premium motion (planning)

## Branches and commits

- **`phase-4/ui-baselines`** (PR #26, spec 004): in sync with origin. Last commit `5c3fa11` fix(e2e): pin panel test events to tomorrow noon UTC. CI run 38833145616 on it is **all green** (lint, typecheck, unit, api, worker-build, e2e-ci, visual). Ready for Rostom's review and merge; nothing pushed or merged by the agent this session.
- **`phase-5/006-premium-motion`** (local only, branched from `phase-4/ui-baselines`, never pushed):
  - `39aa7ed` docs(spec): add spec 006 premium identity with background motion
  - `240179f` docs(spec): clarify, plan and tasks for spec 006
  - `5ad7566` docs(spec): fix spec 006 task ownership and coverage gaps from analysis
- **Uncommitted, not ours (leave alone):** `specs/005-fix-found-bugs/tasks.md` (wording edits) and untracked `specs/005-fix-found-bugs/.gitignore`; they predate this session.
- This handoff file is committed on `phase-5/006-premium-motion`.

## What was done

1. Resumed the prior session's CI fix; confirmed CI green on `5c3fa11`.
2. Ran a direction round for "premium design with user-selected background motion": interactive design canvas at https://claude.ai/artifact/NHdkria1bTDsVYGyW1TXE8 (version 4, private). The artifact is the durable copy of the board.
3. Spec 006 through the speckit pipeline, everything except implementation: specify → clarify (4 questions) → plan (research, data model, contracts) → tasks (35) → analyze → fixed all 8 findings.

Files: `specs/006-premium-motion-identity/{spec.md, plan.md, research.md, data-model.md, contracts/me-appearance.md, contracts/ui.md, tasks.md, checklists/requirements.md}`.

## Decisions made (owner = Rostom unless noted)

- **Replace the Concourse Board identity** (ADR-0006) rather than layer on it. Needs ADR-0007 superseding ADR-0006 and constitution v1.3.0 (Principle VI names ADR-0007 and allows exactly one looping effect, the opt-in background).
- **Surface polish**: translucent (frosted) panels, 16 px radius, over an ambient background; panels reflow (1 column at 360, 2 at 768, full grid on desktop, max 1160 px, no horizontal scroll).
- **Presets**: None, Aurora drift, Board grid, Particles (**default**), Grain, all selectable in Settings › Appearance and applied on every screen.
- **Motion colour**: six swatches (Signal mint #7fd1a8 default, Platform blue #8fb3ff, Lamp amber #f5c27a, Dusk violet #c9a7ff, Coral #ff9fb2, Silver #e9edf2) plus custom; **shown only in light mode**; dark uses a fixed Signal-mint dark tint; the light choice is restored on return.
- **Stored server-side** on the user's account.
- Clarify answers: the panel look **ships unflagged** (constitution 1.1.1); the controls and the moving layer sit behind `appearance.motion`. **Signed-out pages too** (sign-in, sign-up, reset, landing) with the default motion. A **"Translucent panels" switch** (default on) and a **"Pause background motion" switch** (default off), both saved to the account.
- Agent decisions (plan/research): CSS-only motion layer (transform/opacity, no dependency); four new `users` columns through the existing `PATCH /me` (mirrors `accent`); free custom colour with capped tint alpha, proved by a composited-contrast unit test (SC-004 matrix); new unauthenticated `GET /flags/public` with an allowlist of only `appearance.motion` (because `GET /flags` requires a session); landing gets motion at build time via `VITE_APPEARANCE_MOTION`, set in `deploy-staging.yml`.
- Agent calls on analysis findings (Rostom may overrule): widget frames get the glass surface while dialogs, menus and toasts stay opaque; FR-020 narrowed to `/` and `/settings` with Particles and Aurora drift; accepted exception in the plan's Complexity Tracking that signed-in Lighthouse performance stays under 0.9 (no regression only).

## Known issues

- `.spec-context.json` `--batch` writes fail with `WinError 5 Access is denied` (the Companion GUI seems to hold the file); single writes work. The requirement→task coverage map was not recorded there (it is in `tasks.md`). Retry the coverage `--batch` call for `--step tasks` when the panel is closed.
- `.specify/extensions/companion/scripts/plan-blocks.py` crashes: missing part file `call-paths.md`.
- Spec 004 is still unmerged; branch 006 must rebase onto main after PR #26 lands.
- Signed-in Lighthouse performance is below target (`/` ~0.69, `/settings` ~0.86), inherited from spec 004.

## Open questions for Rostom

- Accept or overrule the three agent calls above (dialog opacity, FR-020 scope, Lighthouse exception).
- Spec 004 leftovers still open (from CLAUDE.md): T038, SC-006/SC-008, accent swatch approval, HelloView's fate, header link grouping.
- Whether to merge PR #26 before starting 006 implementation (recommended).

## Exact next step

Draft T001–T003 on `phase-5/006-premium-motion` for Rostom's acceptance (T004): `docs/adr/ADR-0007-premium-identity.md` (Proposed), the constitution v1.3.0 amendment in `.specify/memory/constitution.md`, and the rewritten root `DESIGN.md`. After acceptance, run `/speckit-companion-implement specs/006-premium-motion-identity`, starting at Phase 2 Foundational (the T005–T009 wave). Follow model routing (coordinator brief → Sonnet implementer) and the design-tools rule for UI work.
