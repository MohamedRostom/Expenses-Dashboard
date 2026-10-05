# ADR-0006: Visual identity "Concourse Board", with the Ledger Desk as fallback

**Status:** Proposed
**Date:** 2026-10-05
**Deciders:** Rostom (owner)
**Relates to:** `DESIGN.md`, `specs/004-web-ui-refresh/spec.md` (FR-001, FR-002, FR-016), `.specify/memory/constitution.md` Principle VI, `apps/web/.impeccable/surfaces/apps-web.md`

## Context

Spec 004 refreshes every signed-in screen and the landing page. FR-016 allows the direction to propose a new visual identity, provided the owner approves it here before any screen changes, and FR-002 requires a fallback that keeps every existing decision. The incumbent system was captured on 2026-10-05 as "The Ledger Desk": IBM Plex Sans and Mono, Ledger Green `#1f6e5a`/`#5fbf9f`, Grey Paper and Night Desk grounds, Focus Blue, two shadow heights, tabular figures.

On 2026-10-05 the owner asked for a full replacement world rather than an extension. The world was chosen through impeccable's concept roll (seed key `491e2f62`, Operate mode). Seven grounded candidates came from the audience's world (till receipt, cash envelopes, wall planner, railway timetable, bureau de change board, banknote security print, ledger desk); the roll assigned banknote security print and dealt six catalogue challengers. The owner first kept the roll's assignment, then, on the decision page, chose the dealt challenger **Concourse Board** (a rail concourse split-flap departure board, catalogue id `signals-instruments-split-flap-concourse`), which the round had rated competitive on product clarity. Owner guardrails for the month view: not decorative, not too dense, not too sparse.

Two facts found while doing this bear on the decision. IBM Plex is declared in `packages/ui/src/tokens.css` but never loaded: the repo has no `@font-face` and no font package, so almost every user already sees `system-ui`. And the incumbent dark `--color-critical` equals the light value and measures about 2.8:1 on the dark ground, failing AA.

## Decision (proposed)

Adopt "Concourse Board" as the visual identity of Desk, as written in `DESIGN.md`. The replaced decisions, which are the delta the owner approves:

| Decision | Incumbent | Proposed |
|----------|-----------|----------|
| Type family | IBM Plex Sans and IBM Plex Mono (declared, not loaded) | system UI stack for words, system mono stack for every figure, small spaced capitals for column heads and labels |
| Accent | Ledger Green `#1f6e5a` / `#5fbf9f` | Signal Green `#0e3d2a` / `#2c7452` (still one green accent) |
| Backgrounds | Grey Paper `#f2f4f7` / Night Desk `#121820` | Daylight Steel `#e8eaeb` / Flap Black `#0e1114` |
| Character | The Ledger Desk | Concourse Board: fixed columns, status said once in a fixed place, values that flip in when data arrives |

Adjusted in the proposal: warn becomes Delay Amber `#8a5a00` / `#ffb000`; Focus Blue becomes `#4d80da` / `#a6caff` so the ring reaches 3:1 on the ground, a flap and the accent. Adjusted either way: dark critical (proposal Cancel Red `#ff6b6b`; fallback `#f0897c`), both AA. Kept: three theme states (dark is the reference rendering, light the daylight board), hand-written single-hue SVG charts, status colours never a series, two shadow heights, tabular figures, the eight account colours.

New rules the identity brings: fixed columns; a row lamp (4px amber bar for a pending rate, red for an over-budget category) always paired with its word; the departure tile (remaining budget at Display size) as the largest figure; the arrival flip, one whole-cell `rotateX` per value per data update, never per character, never on load, none under reduced motion; no brushed steel, vent grids, flap textures, split-flap font or icon tab bar. One new token, `--tracking-wide` (0.08em), is added to the token contract in T026.

## Fallback

If this ADR is rejected, `DESIGN.md` `## Fallback` applies: the Ledger Desk refined. Every decision is kept except the dark critical AA fix (`#f0897c`), and only hierarchy, spacing, motion, states and consistency change. No second direction round is needed.

## Consequences

- Accepting replaces the type family and the incumbent green accent (with another green), both named in constitution Principle VI, so T028 amends Principle VI in the same change (MINOR version bump, Sync Impact Report, "Last Amended" date, this ADR as the amendment's ADR) and updates the "Design system" section of `CLAUDE.md`. Only the owner merges it.
- Until a decision, the proposed values exist only in `apps/web/src/catalogue/proposed-tokens.css` under `[data-identity="proposed"]` (T026), seen in the catalogue and the mock-ups on dev and preview; shipped screens keep `packages/ui/src/tokens.css`. At the decision that file and its wrappers are deleted either way (T028).
- The look change needs no feature flag (constitution v1.1.1). Screens adopt it one change at a time in Slice B (T031 to T042).
- The arrival flip needs a small piece of block logic (play the transition only when a rendered value changes after first render); it lives in `Tile` and `DataTable`, uses CSS transitions only, and adds no dependency.
- Light mode is the riskier rendering: the world is dark-first, so the daylight board is reviewed first at T028.
- Dropping a declared web font that was never loaded changes nothing on the wire; the figure face varies by platform (Cascadia or Consolas, SF Mono, Roboto Mono), which the snapshots absorb because they render in the pinned Playwright image.
- No new runtime or dev dependency.

## Alternatives considered

- **Extend the Ledger Desk** (adjusted rows only). Offered first; the owner chose a new world instead. It remains the fallback.
- **Security Print** (banknote security printing, the roll's assignment). Chosen first, then replaced by the owner's pick on the decision page.
- **Till Receipt** (impeccable's own top candidate). Most familiar, close to the cream-and-mono rut, wastes width at desktop.
- **Category standard** (white cards, one brand colour). Indistinguishable from other budgeting apps by design.
- Five further dealt challengers (streaming title wall, timetable slide rack, bitmap specimen, Crouwel grid, botanical folio) were declined on both axes.
