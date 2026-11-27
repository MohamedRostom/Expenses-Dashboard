# Handoff 2026-11-26: widget polish shipped to PR #47, spec 007 (Event horizon) planned

## Branches and commits

- `fix/005-fix-found-bugs` (PR #47), pushed, CI all green on run 45779420881 (the `api` widgets-load timing test failed once at 210 ms against 150 ms and passed on re-run; it is the known flaky timing test).
  - `3842f0e` feat(widgets): menu button doubles as drag handle; tile-style currency widget
  - `b93a014` test(visual): baseline the expanded currency frame at 360 and 1280
- `feature/007-lensed-backdrop`, cut from `fix/005-fix-found-bugs` (not `main`: `main` lacks the speckit companion scripts). Pushed to origin, no PR.
  - `2ae15bd` docs(spec-007): spec, plan, research and tasks for the Event horizon background
  - `8f2d458` docs(spec-007): record ADR-0009 as accepted by Rostom
- Untracked on purpose: `.claude/sessions/*.md` handoffs and `.github/workflows/cerebrofy-arch.yml` (leave alone).
- No CI has run on `feature/007-lensed-backdrop`: `ci.yml` triggers only on `pull_request` and pushes to `main`. A PR is needed for a pipeline, and only Rostom can ask for one.

## Done this session

- Widget frames: left grip removed; the right ⋯ button opens the menu on tap and starts a drag after a 400 ms hold or 8 px of movement; the header is shorter.
- Currency widget: tiles with a neutral code badge, headline rate, date on the right, Day and 30-day chips (glyph plus word), "since" in the chip tooltip and screen-reader text.
- Muted text on the currency tile tint measured at 5.7:1 or more in the worst case (both themes, black and white ground tints, solid panels).
- Spec 007 through speckit companion specify, plan and tasks: `specs/007-lensed-black-hole-backdrop/` (spec.md, plan.md, research.md, tasks.md, .spec-context.json). 39 tasks, 7 phases, nothing implemented.

## Decisions (spec 007, details in research.md R1 to R10)

- Non-rotating (Schwarzschild) black hole, thin disc seen about 8 degrees above its plane, Doppler beaming and redshift on: physically right, testable, and visibly not the film's frame. Name "Event horizon", preset id `event-horizon`, flag `appearance.event_horizon` (default off, unlike the accent and motion flags).
- Raw WebGL 1 fragment shader, per-pixel Verlet integration of a = -1.5 h² x / r⁵, no dependency.
- Transparent canvas over the warm ground; disc white-hot to `--motion-tint`; opacity caps set by `packages/ui/src/contrast.test.ts`.
- 30 fps, half resolution ignoring DPR (the glass blurs 24 px), three detail tiers then a still frame.
- A controller (`packages/ui/src/motion/loop.ts`) reads `data-motion-paused`, reduced motion, reduced data and visibility itself, because CSS stop rules cannot stop a script loop.
- One CSS still drawing is the Settings thumbnail and the fallback; the WebGL module is a dynamic import.
- Migration 0016 drops and re-adds `users_motion_preset_check` and inserts the flag with `default_on = false`.
- **ADR-0009 accepted by Rostom (2026-11-26)**: DESIGN.md's "No script loop, canvas, WebGL or dependency" rule is amended to allow one lazily loaded WebGL preset under the same stop rules. The ADR file itself is task T001 and is not written yet.

## Known issues

- The currency "since" date is visible only on hover and to screen readers, so touch users don't see it.
- `apps/api/test/widgets-load.test.ts` (150 ms budget) is flaky under CI load.
- `python3` is not on this Windows machine: run the companion scripts with `python`.
- GitHub reports one moderate Dependabot alert on `main`.

## Open questions for Rostom

- Open a PR for `feature/007-lensed-backdrop` now (docs only), or only once implementation lands?
- T039: look at the preset on a real phone and laptop, and decide when to turn `appearance.event_horizon` on.
- Merge PR #47 when ready (only on your word).

## Exact next step

On `feature/007-lensed-backdrop`, run `/speckit-companion-implement`, starting with Phase 1 (T001 ADR-0009 marked Accepted, T002 the WebGL screenshot-stability spike in the Playwright container), then Phase 2's test wave T003 to T006.
