---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: apps/web (signed-in app)

Mode: Operate. The visitor completes a task: logs an expense at the moment of payment on a phone, or reviews where the month stands against budgets at a desk.

Audience and job: the three PRODUCT.md audiences on one screen family. Most frequent task: quick add (about 15 seconds, one-handed). Most important read: remaining budget for the month, then the entries board, then category bars.

Constraints: spec 004 (FR-001 to FR-017); no workflow change (FR-010); WCAG 2.2 AA in both themes; 44 px targets at phone; no new runtime dependency; three theme states; hand-written SVG charts; status colours never a series. The proposed world lives only in the catalogue and the mock-ups until ADR-0006 is accepted; the fallback is the Ledger Desk.

Owner guardrails (2026-10-05): not decorative, not dense at 360, not sparse.

Memorable moment: a pending amount flipping into its converted value when the rate arrives.

Unresolved: the owner's ADR-0006 decision (T028); SC-002 outsider preference test; the daylight (light) board is the riskier rendering.

## Direction contract

THESIS: The month is a departure board: fixed columns, status said once in a fixed place, values that flip in when data arrives. Refuses the category default of white cards, a brand colour and donut charts.

OWN-WORLD: Flap Black night board (Daylight Steel by day), letter-white figures in tabular system mono in fixed cells, small spaced capitals for column heads, one Signal Green for action and spend, Delay Amber lamps for pending rates, Cancel Red lamps for over budget, crisp 2/4/8 px corners, two shadow heights.

STORY: The visitor reads how much is left, scans the board for anything amber or red, trusts that every amount is exact, and adds an expense without hunting.

FIRST VIEWPORT: Raised flap header (month switcher, nav links, add). Below, the departure tile (remaining budget at Display) with spent and forecast tiles beside it (one row from 1024 px, stacked at 360); then the entries board, three fixed columns at 360 and four from 768, with category bars beside it from 1024. The primary action is the header's add button and the sheet's one filled button.

FORM: Concourse Board (rail concourse split-flap departure board), dealt challenger chosen by the owner over the roll's assigned Security Print; seed key 491e2f62. Signature move: the arrival flip, one whole-cell rotateX per changed value, never per character, never on load.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
