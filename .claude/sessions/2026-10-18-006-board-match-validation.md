# 2026-10-18 — spec 006: board match, flaky tests, full validation

## Branch and commits
Local branch `phase-5/006-premium-motion`, not pushed. Last commits:
- `a58e9da` docs(006): record T034 full validation and current state
- `6a0f592` test(006): deterministic settings sessions visual, DOM-quiet ready wait (T036)
- `6a64615` feat(006): design tools pass, board table inset, readable phone tables, local e2e shared account (T031, T037, T049)
- `20471ab` feat(006): board look for panels and hero, flaky test fixes, API test worker cap (T046-T048)
- `71f93dc`, `c9a5763` earlier 006 work

Uncommitted on purpose (not ours): `specs/005-fix-found-bugs/tasks.md`, `specs/.gitignore`, `specs/005-fix-found-bugs/.gitignore`.

## Done
All agent tasks in `specs/006-premium-motion-identity/tasks.md`: T031, T034, T036, T037, T046–T049 (and everything before). Each stage was reviewed by a separate read-only agent and its findings fixed before the next.

T034 results, local: lint, typecheck, unit (core ~94 % lines), API 59/59 files, 477 tests, 89.96 % lines, `worker:build`, OpenAPI not stale, `pnpm audit --audit-level high`, visual 745/745 (retries 0, Playwright docker image, two shards), e2e ci twice at `--workers=2` (187 passed, 2 skipped, zero flaky).

## Decisions
- Board month layout adopted, Trend panel and Forecast tile kept. `appearance.motion` stays off in config.
- API vitest `maxWorkers: 4`: one Postgres Testcontainer per file exhausted Docker Desktop uncapped.
- Visual tests wait on `ready()` (DOM quiet 500 ms, no `[aria-busy]`, no `.desk-skeleton`) instead of `networkidle`; the settings screen mocks a fixed `/me/sessions` row.
- The cost line ($277) was accepted by Rostom ("Full goal").

## Known issues
- `pnpm format:check` fails locally only on untracked tool caches (graphify-out, .cerebrofy, .impeccable, .lighthouseci); CI is clean.
- `reflow.spec.ts:54`, `journeys.spec.ts:82` and some non-visual specs still use `networkidle`; no flakes seen.
- Landing Lighthouse with motion on is unmeasured on compose (no `VITE_APPEARANCE_MOTION` in its build).
- Long background shells get stopped by Claude Code under host memory pressure (~2 GB free); run long suites in the foreground in shards.

## Open for Rostom
- T035: sign off every screen at phone and desktop width against the direction board (SC-007).
- T038: approve or change the `local-secrets` environment approvals.
- SC-001, SC-007 `needs-rostom`. Spec stays at "implemented" until these close.
- Whether to push the branch and open the PR (not done; needs his explicit ask).

## Next step
Rostom reviews the screens (T035). If he asks, push `phase-5/006-premium-motion` and open the PR; then watch CI's `visual` and `e2e-ci` jobs.
