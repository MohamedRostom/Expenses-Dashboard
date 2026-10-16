# Session handoff: spec 004 T025, Concourse Board direction (2026-10-05)

## Branch and commits

- Branch `phase-4/ui-baselines`, nothing pushed.
- `d47c002` docs(004): Security Print proposal (superseded).
- `15f7116` docs(004): switch the proposed identity to Concourse Board (T025). This is the current direction.
- Uncommitted: only `.impeccable/questions/` (decision-page runtime state; do not commit).

## Tasks

- Done: T026 (`5c77514`, proposed-tokens.css, tokens.test.ts proposed block, --tracking-wide). T025 (DESIGN.md, ADR-0006 Proposed, `.impeccable/design.json`, surface brief `apps/web/.impeccable/surfaces/apps-web.md`).
- Next: T027 mock-ups (MonthViewMock, AddExpenseMock, SettingsMock inside `data-identity="proposed"`, MonthViewFallbackMock, `before.spec.ts` `@manual`), then T028 owner review.

## Decisions and why

- Owner asked for a new world (not an extension). impeccable concept roll seed `491e2f62` (Operate). Owner picked the dealt challenger Concourse Board (split-flap departure board) on the decision page, overriding the roll's Security Print.
- Shell plate is not a new colour role; the 12 roles stay. Header is a raised flap (`--color-surface-raised`).
- Type: system UI words, system mono figures. IBM Plex was declared but never loaded (no `@font-face`).
- Values (all contract pairs checked by script): light accent `#0e3d2a`, focus `#4d80da`, bg `#e8eaeb`; dark accent `#2c7452`, focus `#a6caff`, bg `#0e1114`; warn `#8a5a00`/`#ffb000`; critical `#b00020`/`#ff6b6b`. Full list in DESIGN.md frontmatter.
- Signature move: arrival flip, one whole-cell `rotateX` per changed value after first render, none under reduced motion. Row lamps (amber pending, red over) always with a word.
- Taste dials 3 / 3 / 5. Owner guardrails: not decorative, not too dense, not too sparse.

## Known red tests

- None: design-doc 6/6, ui suite 339/339.

## Open questions for Rostom

- None blocking T026. T028 is owner-gated (ADR-0006 accept or fallback).

## Exact next step

Run `/speckit-implement continue with T027` (mock-ups incl. a pending-rate-resolving state for the arrival flip; review the daylight board first; rerun the impeccable critique with sub-agents on the mock-ups).
