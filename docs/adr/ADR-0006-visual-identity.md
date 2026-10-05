# ADR-0006: Visual identity "Security Print", with the Ledger Desk as fallback

**Status:** Proposed
**Date:** 2026-10-05
**Deciders:** Rostom (owner)
**Relates to:** `DESIGN.md`, `specs/004-web-ui-refresh/spec.md` (FR-001, FR-002, FR-016), `.specify/memory/constitution.md` Principle VI, `apps/web/.impeccable/surfaces/apps-web.md`

## Context

Spec 004 refreshes every signed-in screen and the landing page. FR-016 allows the direction to propose a new visual identity, provided the owner approves it here before any screen changes, and FR-002 requires a fallback that keeps every existing decision. The incumbent system was captured on 2026-10-05 as "The Ledger Desk": IBM Plex Sans and Mono, Ledger Green `#1f6e5a`/`#5fbf9f`, Grey Paper and Night Desk grounds, Focus Blue, two shadow heights, tabular figures.

On 2026-10-05 the owner asked for a full replacement world rather than an extension. The world was chosen through impeccable's concept roll (seed key `491e2f62`, Operate mode): seven grounded candidates from the audience's world, ordered by resonance (till receipt, cash envelopes, wall planner, railway timetable, bureau de change board, banknote security print, ledger desk), with the roll assigning the sixth, banknote and cheque security printing. The owner kept the roll's assignment over impeccable's own pick (till receipt), a competitive alternate (split-flap concourse board) and the category standard. Owner guardrails for the month view: not decorative, not too dense, not too sparse.

Two facts found while doing this bear on the decision. IBM Plex is declared in `packages/ui/src/tokens.css` but never loaded: the repo has no `@font-face` and no font package, so almost every user already sees `system-ui`. And the incumbent dark `--color-critical` equals the light value and measures about 2.8:1 on the dark ground, failing AA.

## Decision (proposed)

Adopt "Security Print" as the visual identity of Desk, as written in `DESIGN.md`. The replaced decisions, which are the delta the owner approves:

| Decision | Incumbent | Proposed |
|----------|-----------|----------|
| Type family | IBM Plex Sans and IBM Plex Mono (declared, not loaded) | system UI stack for words, system mono stack for every figure |
| Accent | Ledger Green `#1f6e5a` / `#5fbf9f` | Intaglio Teal `#1d3c46` / `#2d6f72`, also the shell header (the plate) |
| Backgrounds | Grey Paper `#f2f4f7` / Night Desk `#121820` | Note Paper `#eef1ec` / Night Note `#0f161b` |
| Character | The Ledger Desk | Security Print: a denomination read at a glance, a serial line that proves it |

Adjusted in the proposal: Focus Blue becomes `#4c84d9` / `#9cc3ff` so the ring reaches 3:1 on the teal plate, which the old pair could not. Adjusted either way: dark Critical Red becomes `#f0897c` (AA). Kept: warn amber, three theme states, hand-written SVG charts (the fill becomes an SVG line-hatch pattern), status colours never a series, two shadow heights, tabular figures, the eight account colours.

New rules the identity brings: one denomination (the remaining budget) per screen as the only ink-reversed plate; one numeral face at every size; the serial line (original amount, currency, rate, rate date, source) under tile figures and revealed on focus in table rows; no guilloche, rosettes, watermarks or engraved borders.

## Fallback

If this ADR is rejected, `DESIGN.md` `## Fallback` applies: the Ledger Desk refined. Every decision is kept except the dark Critical Red fix, and only hierarchy, spacing, motion, states and consistency change. No second direction round is needed.

## Consequences

- Accepting replaces the type family and the green accent, both named in constitution Principle VI, so T028 amends Principle VI in the same change (MINOR version bump, Sync Impact Report, "Last Amended" date, this ADR as the amendment's ADR) and updates the "Design system" section of `CLAUDE.md`. Only the owner merges it.
- Until a decision, the proposed values exist only in `apps/web/src/catalogue/proposed-tokens.css` under `[data-identity="proposed"]` (T026), seen in the catalogue and the mock-ups on dev and preview; shipped screens keep `packages/ui/src/tokens.css`. At the decision that file and its wrappers are deleted either way (T028).
- The look change needs no feature flag (constitution v1.1.1: a change to the look of existing screens needs no flag). Screens adopt it one change at a time in Slice B (T031 to T042).
- Dropping a declared web font that was never loaded changes nothing on the wire and keeps Lighthouse performance where it is; the figure face varies by platform (Cascadia or Consolas, SF Mono, Roboto Mono), which the visual snapshots absorb because they render in the pinned Playwright image.
- No new runtime or dev dependency.

## Alternatives considered

- **Extend the Ledger Desk** (adjusted rows only, no replacement). Offered first; the owner chose a new world instead. It remains the fallback.
- **Till Receipt** (impeccable's own top candidate). Most familiar, close to the cream-and-mono rut, wastes width at desktop.
- **Concourse Board** (split-flap departure board, competitive). Strong on clarity for a date-ranked table, but dark-first and motion-heavy under the 280 ms cap.
- **Category standard** (white cards, one brand colour). Indistinguishable from other budgeting apps by design.
- Five further dealt challengers (streaming title wall, timetable slide rack, bitmap specimen, Crouwel grid, botanical folio) were declined on both axes; each lent one discipline to the chosen direction (provenance revealed on focus, one reversed plate, one numeral face, whole-column reflow, one shared budget scale).
