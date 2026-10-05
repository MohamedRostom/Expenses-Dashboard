---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: apps/web (signed-in app)

Mode: Operate. The visitor completes a task: logs an expense at the moment of payment on a phone, or reviews where the month stands against budgets at a desk.

Audience and job: the three PRODUCT.md audiences on one screen family. Most frequent task: quick add (about 15 seconds, one-handed). Most important read: remaining budget for the month, then category bars, then entries.

Constraints: spec 004 (FR-001 to FR-017); no workflow change (FR-010); WCAG 2.2 AA in both themes; 44 px targets at phone; no new runtime dependency; three theme states; hand-written SVG charts; status colours never a series. The proposed world lives only in the catalogue and the mock-ups until ADR-0006 is accepted; the fallback is the Ledger Desk.

Owner guardrails (2026-10-05): not decorative, not dense at 360, not sparse (the entries table never pushed below the fold by whitespace).

Memorable moment: the remaining-budget denomination, the one reversed figure on the screen, with its serial line underneath.

Unresolved: the owner's ADR-0006 decision (T028); SC-002 outsider preference test.

## Direction contract

THESIS: Every figure is issued like a banknote: a denomination read at a glance and a serial line that proves where it came from. Refuses the category default of white cards, one brand colour and donut charts.

OWN-WORLD: Faintly sage note paper, intaglio-teal plate for the shell header and the primary action, plate-ink text, figures in a system mono with tabular numerals at every size, budget bars filled with fine diagonal line hatching that turns solid Critical Red when over, crisp 2/4/8 px corners, two shadow heights.

STORY: The visitor sees how much is left this month, trusts it because each amount shows its original currency, rate and rate date, and adds or reviews an expense without hunting.

FIRST VIEWPORT: Teal plate header (month switcher, nav, add). Below, the remaining-budget denomination at Display size on the one ink-reversed plate, spent and forecast tiles beside it (one row from 1024 px, stacked at 360), then category bars with budget ticks; entries table beside them from 1024 px, below at 360. Add-expense primary action in the header and as the sheet's one filled button.

FORM: Security Print (banknote and cheque security printing), position 6 of 7 on the grounded list, assigned by the roll; seed key 491e2f62. Signature move: the serial line (original amount, currency, rate, rate date, source) under each tile figure and revealed on focus in table rows.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
