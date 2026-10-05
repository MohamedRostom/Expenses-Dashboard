---
name: Desk (working name)
description: A multi-currency expense tracker. Proposed identity "Security Print" (ADR-0006); the incumbent Ledger Desk is the fallback.
colors:
  intaglio-teal: "#1d3c46"
  intaglio-teal-dark: "#2d6f72"
  note-paper: "#eef1ec"
  night-note: "#0f161b"
  plate-ink: "#16202a"
  plate-ink-dark: "#e8eee9"
  ink-muted: "#485553"
  ink-muted-dark: "#a4b2ae"
  sheet: "#f9faf7"
  sheet-raised: "#ffffff"
  sheet-dark: "#162027"
  sheet-raised-dark: "#1d2a32"
  rule-line: "#6c7a77"
  rule-line-dark: "#62736f"
  focus-blue: "#4c84d9"
  focus-blue-dark: "#9cc3ff"
  selection-sage: "#dbe6e3"
  selection-sage-dark: "#1f3a3d"
  warn-amber: "#8f5810"
  warn-amber-dark: "#d99a4e"
  critical-red: "#a83a2e"
  critical-red-dark: "#f0897c"
  palette-teal: "#0f6b56"
  palette-blue: "#1a5fb4"
  palette-violet: "#6a3fa0"
  palette-pink: "#a02a5e"
  palette-orange: "#a2450a"
  palette-amber: "#8a5a05"
  palette-green: "#2d6b2f"
  palette-slate: "#41505f"
typography:
  display:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "3rem"
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  figure:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: "1.75rem"
    fontFeature: "tnum"
  serial:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontFeature: "tnum"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "20": "80px"
  "24": "96px"
components:
  plate-header:
    backgroundColor: "{colors.intaglio-teal}"
    textColor: "{colors.sheet}"
    padding: "12px 16px"
  button-primary:
    backgroundColor: "{colors.intaglio-teal}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  button-danger:
    backgroundColor: "{colors.critical-red}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  denomination:
    backgroundColor: "{colors.plate-ink}"
    textColor: "{colors.note-paper}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "16px"
  tile:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.plate-ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel-frame:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  tab:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "12px 4px"
  tab-selected:
    textColor: "{colors.plate-ink}"
---

# Design System: Desk (working name)

<!-- Spec 004 T025, 2026-10-05: the proposed direction. The frontmatter describes the proposed identity, whose values live in apps/web/src/catalogue/proposed-tokens.css (T026) until ADR-0006 is decided in T028. Shipped screens keep the incumbent values in packages/ui/src/tokens.css, recorded under ## Fallback. -->

## Overview

**Creative North Star: "Security Print"**

State: Proposed (ADR-0006 open; fallback is the Ledger Desk, see ## Fallback)

Desk treats every figure the way a banknote treats its value. The denomination is printed large, in one place, where the eye lands first, and around it runs the fine print that proves the note is genuine: a serial number, an issue date, an issuing authority. On Desk the denomination is the month's remaining budget, and the fine print is the serial line under each amount: its original currency and amount, the ECB rate used, the date of that rate and its source. Exactness is the product's first principle, and this direction makes it visible instead of keeping it in a details drawer.

**Character: plain, exact, engraved, calm.** Plain because it is a daily tool used one-handed at a till. Exact because every number traces back to its rate. Engraved because figures are set like security print, in one tabular face with fine line work instead of fills and gradients. Calm because the screen answers one question first ("where does my month stand?") and holds everything else at a quieter level.

The world lends four things and only these: a committed palette (an intaglio-teal plate for the shell and the primary action, on faintly sage note paper), a type pairing (system UI words, system mono figures), a working density, and one signature move, the serial line. It never supplies layout, navigation or controls. Those stay the standard web ones: a header with links, tabs, buttons, native inputs and a real `<table>`. There is no guilloche, rosette, portrait, watermark, microtext texture or engraved border anywhere. The owner's guardrails (2026-10-05) are not decorative, not dense at 360 px, and not sparse.

**Key Characteristics:**
- An intaglio-teal plate: the shell header and the primary action share the one accent.
- One denomination per screen, ink-reversed, at Display size. It is the only reversed plate.
- Every figure in a system mono with tabular numerals, from the denomination down to a table cell.
- The serial line (original amount, currency, rate, rate date, source) under each tile figure, revealed on focus in table rows.
- Budget bars filled with fine diagonal line hatching, turning solid Critical Red when over budget, so the over state reads without colour.
- Lifted surfaces at two heights, crisp 2/4/8 px corners.

## Colors

A restrained palette with a committed shell: neutrals tinted toward sage, one teal ink, and two status colours held in reserve.

### Primary
- **Intaglio Teal** (`intaglio-teal` light, `intaglio-teal-dark` dark; role `--color-accent`): the shell header (the plate), the primary button, the selected-tab underline, the hatching on budget bars and the current nav link's underline. Text on it is Sheet in light mode and Plate Ink dark in dark mode (`--color-accent-fg`). In dark mode the plate is a mid teal rather than a lighter mint, so the header does not glow.

### Neutral
- **Note Paper** (`note-paper`, `--color-bg`): the light page ground, a cool off-white tinted faintly toward sage. Never warm cream.
- **Night Note** (`night-note`, `--color-bg` dark): the dark page ground, a blue-green black.
- **Plate Ink** (`plate-ink` / `plate-ink-dark`, `--color-fg`): body text and figures; also the ground of the one reversed denomination plate.
- **Muted Ink** (`ink-muted` / `ink-muted-dark`, `--color-fg-muted`): labels, serial lines, "as of" stamps, unselected tabs.
- **Sheet** (`sheet`, `sheet-raised`, `sheet-dark`, `sheet-raised-dark`; `--color-surface`, `--color-surface-raised`): lifted surfaces. Tiles and panels are Sheet; inputs, menus and dialogs are raised Sheet.
- **Rule Line** (`rule-line` / `rule-line-dark`, `--color-border`): control borders, the tab baseline and table header rules.
- **Focus Blue** (`focus-blue` / `focus-blue-dark`, `--color-focus`): the focus ring and nothing else. Its values were chosen so the ring reaches 3:1 on the page, on Sheet and on the teal plate, in both themes.
- **Selection Sage** (`selection-sage` / `selection-sage-dark`, `--color-selection`): selected rows and selected text.

### Status
- **Warn Amber** (`warn-amber` / `warn-amber-dark`, `--color-warn`): pending rate lookups, stale data, approaching budget.
- **Critical Red** (`critical-red` / `critical-red-dark`, `--color-critical`): over budget, error titles, the danger button. The dark value is new: the old dark value equalled the light one and failed AA (2.8:1).

### Account palette
- **Eight account colours** (`palette-teal` to `palette-slate`) identify connected mail and calendar accounts; unchanged, each with its dark twin in `tokens.css`, each at least 3:1 on the page.

### Named Rules
**The One Ink Rule.** Intaglio Teal is the only accent. It marks the shell, the primary action, the current location and spend against budget, and nothing decorative.

**The Status Is Not a Series Rule.** Warn Amber and Critical Red never appear as a chart series, category colour or account colour. When red shows up, something is over budget or broken.

**The Focus Is Blue Rule.** The focus ring is Focus Blue, 2px, with a 2px offset, on every interactive element in both themes, including controls sitting on the teal plate.

## Typography

**Word Font:** the system UI stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`)
**Figure Font:** the system mono stack (`ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace`)

**Character:** words are set in whatever the phone or desktop already uses for its own interface, which is the most legible face a user owns and costs no download. Figures are set in the platform's mono, which reads like a printed serial number and aligns digit for digit. IBM Plex was declared by the incumbent tokens but never loaded (no `@font-face` exists in the repo), so most users already see `system-ui`; this direction makes that honest instead of aspirational.

### Hierarchy
- **Display** (mono 600, 2.5rem/3rem, −0.02em, tabular): the denomination, once per screen. FR-011: no heading on the screen is larger.
- **Headline** (600, 1.75rem/2.25rem, −0.02em): page headings, used sparingly; the month view has none above the denomination.
- **Title** (600, 1.125rem/1.75rem): panel and section headings.
- **Body** (400, 1rem/1.5rem): running text, form values, table cells.
- **Label** (600, 0.875rem/1.25rem): tile labels, tabs, field labels, panel headers. Rank among labels is weight and colour, never another size.
- **Figure** (mono 500, 1.125rem/1.75rem, tabular): tile values and amounts in rows (rows use Body size in the same face).
- **Serial** (mono 400, 0.75rem/1rem, tabular, Muted Ink): the serial line and "as of" stamps. Currency codes stay in capitals as data, not as styling.

### Named Rules
**The Tabular Figures Rule.** Every amount, rate and date is set in the figure face with `font-variant-numeric: tabular-nums`, so columns of money align digit for digit. Amount inputs follow the same rule.

**The One Numeral Face Rule.** The figure face runs from the Display denomination to the smallest serial line. No second numeral face, no proportional digits anywhere a number is read.

## Layout

The spacing scale is a 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96). Content is centred within `--content-max` (72rem). The gutter is 16px on phones and 32px from 768px.

The grid reflows by whole columns, never by fractions: one column at 360, two at 768, and from 1024 the tiles sit in one row (the denomination spans two of the four tile columns) with category bars and the entries table side by side. Every month and every category bar shares one budget scale, so periods compare without rescaling.

The shell is a plate header: month switcher, the wrapping row of nav links and the add action. No hamburger menu; links wrap at 360. Tap targets are 44px on phones; desktop controls at least 24px, dense table rows and menu items 32px. Dashboard widgets keep their fixed height (12rem). At 360 the first viewport shows the plate header, the denomination and the top of the category bars; whitespace never pushes the entries table further than one scroll.

## Elevation & Depth

Surfaces are lifted, like notes lying on a desk. Tiles, panels and widget frames are Sheet with the Raised shadow; menus, dialogs, sheets and toasts take the Overlay shadow. In dark mode the shadows deepen and Sheet steps lighter. Shadows are tinted toward Plate Ink in light mode, never pure black.

### Shadow Vocabulary
- **Raised** (`0 1px 2px rgb(22 32 42 / 0.08), 0 1px 3px rgb(22 32 42 / 0.06)`; dark `0 1px 2px rgb(0 0 0 / 0.4), 0 1px 3px rgb(0 0 0 / 0.3)`): tiles, panels, widget frames, a focused table row.
- **Overlay** (`0 8px 24px rgb(22 32 42 / 0.16), 0 2px 6px rgb(22 32 42 / 0.08)`; dark `0 8px 24px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.4)`): dialogs, sheets, menus, toasts.

### Named Rules
**The Two Heights Rule.** There are exactly two elevations, Raised and Overlay. No third shadow, no hairline-instead-of-shadow on tiles or panels.

**The One Plate Rule.** Exactly one element per screen is ink-reversed: the denomination. Everything else that needs rank gets it from weight, colour or position.

## Shapes

Corners are crisp: 2px on buttons, inputs and tabs (`--radius-sm`), 4px on tiles, panels and the denomination (`--radius-md`), 8px on dialogs and sheets (`--radius-lg`). Borders are 1px. Budget bars are square-ended SVG rectangles; their fill is a 45° line hatch (1px line, 4px pitch) in Intaglio Teal over a track of Plate Ink at 8%; over budget the fill is solid Critical Red. Spinners and status dots are the only circles.

## Components

Block conventions (every block in `packages/ui/src/components/`, contracts/blocks.md):

- **Naming and props:** PascalCase blocks; visual choice through `variant`, `size` and `density` props only, never ad-hoc classes.
- **State props:** `loading`, `empty`, `error` (`{ cause }`). Error copy comes from a `causeMessages` map keyed by cause; the last content stays visible under the message.
- **Focus:** `:focus-visible` outline `2px solid var(--color-focus)`, offset 2px.
- **Targets:** `var(--target-min)` (44px) at phone; 32px only inside `DataTable` dense rows and `MenuButton` menus at desktop.
- **Density dial:** `density="comfortable"` (default, phone) and `density="compact"` (desktop review); compact removes one spacing step from vertical padding and never shrinks type.
- **Figures:** any number renders in `--font-mono` with `tabular-nums`.

### Buttons
Solid, square-shouldered, decisive. Primary is a teal plate with Sheet text; secondary is a 1px Plate Ink outline; ghost has no border; danger is Critical Red with Sheet text. 44px tall at phone, label 0.875rem 600. Loading keeps the width and shows an inline spinner with `aria-busy`. Pressed state translates 1px down.

### Inputs / Fields
Raised Sheet field with a 1px Rule Line border, 2px radius, label above (Label role), error below in Critical Red linked by `aria-describedby`. The amount variant is right-aligned in the figure face with the currency code as a leading adornment.

### Select
Native-backed, styled like Input, with a chevron drawn by the platform.

### Dialog (the sheet)
Bottom sheet at phone, side panel from 1024, centred for confirmations. Raised Sheet, Overlay shadow, 8px radius on the free edges, scrim of Plate Ink at 40%.

### Toast
Raised Sheet, Overlay shadow, a 4px leading rule in the variant's colour (teal for success, amber, red), undo as a ghost button.

### Tile and the Denomination (signature)
A tile is a Sheet with label, figure and serial line. The `denomination` is the month's remaining budget, reversed against the page: `--color-fg` ground with a `--color-bg` Display figure (Plate Ink and Note Paper in light; in dark the plate turns light and the figure dark), its serial line ("of GBP 2,400.00 budget · 12 days left") beneath at 7.5:1. One per screen. An over-budget tile turns its figure Critical Red; the denomination switches to the over variant (plate ground `--color-critical`, figure `--color-bg`, 5.6:1 light and 7.5:1 dark, with a leading minus and the word "over" in its serial line so colour is never the only signal) and never stops being the one plate.

### PanelFrame
Titled Sheet with the Raised shadow: Title-role heading, optional `MenuButton`, body, and the Skeleton, EmptyState and ErrorState slots. Compact variant for widgets keeps the fixed 12rem height.

### DataTable
A real `<table>` with a caption. Header row in Label role over a Rule Line; rows separated by space, not by a rule under every row. Amount columns right-aligned in the figure face. A focused or hovered row lifts to Raised and reveals its serial line on a second line; other rows stay single-line (the signature move, borrowed as discipline from focus-driven reveal).

### Category Bars (signature chart)
Hand-written SVG. Category name left (truncated with the full name in the accessible name), spent and budget in the figure face right, bar below with the line hatch, a 1px Plate Ink tick at the budget, solid Critical Red past it. A table view is always one tab away.

### Tabs
Underline tabs; Label role in Muted Ink, Plate Ink when selected with a 2px teal underline on a Rule Line baseline. 44px tall at phone.

### Navigation
Inside the plate header: a wrapping row of text links in Sheet colour at 0.875rem 600; the current page has a 2px Sheet underline. Sign out sits at the far end. No icon bar, no hamburger.

### MenuButton, ThemeToggle, Skeleton, EmptyState, ErrorState, Kbd
MenuButton is a ghost icon button opening an Overlay menu; ThemeToggle is a segmented radiogroup with the selected segment on raised Sheet; Skeleton blocks are Plate Ink at 6% with an opacity pulse (static under reduced motion); EmptyState and ErrorState use Title and Body roles with one action; Kbd is the serial role on raised Sheet with a 1px Rule Line.

## Do's and Don'ts

### Do:
- **Do** give each screen exactly one denomination, and make it the largest figure on the screen.
- **Do** set every amount, rate and date in the figure face with tabular numerals.
- **Do** show the serial line on tiles and reveal it on focus in rows, so provenance is one glance away.
- **Do** keep Intaglio Teal to the shell, the primary action, the current location and spend.
- **Do** lift tiles and panels with Raised and use Overlay only above the page.
- **Do** use the 2px Focus Blue ring with a 2px offset everywhere, including on the plate.
- **Do** give every panel skeleton, empty and error states with copy chosen by cause.
- **Do** define colours as tokens in all three theme states.

### Don't:
- **Don't** add guilloche, rosettes, watermarks, portraits, microtext textures or engraved borders. The world lends type, palette, density and the serial line, nothing else.
- **Don't** reverse a second element to ink; the denomination is the only plate.
- **Don't** add a chart library, a third shadow, a second accent or a second numeral face.
- **Don't** reuse Warn Amber or Critical Red as a series, category or account colour.
- **Don't** rule every table row; separate rows with space.
- **Don't** use teal for focus; focus is always blue.

## References

At most three, used for principles and scales only; no logo, illustration, icon or brand asset is copied. Full reasoning in `docs/design/SHORTLIST.md`.

1. **Linear** (`docs/design/references/linear.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Linear's marks.
   - A small-step type ramp with weight capped at 600 and negative tracking only at display sizes.
   - A stepped dark surface ladder (Sheet, raised Sheet).
   - 44px touch controls.
2. **Stripe** (`docs/design/references/stripe.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Stripe's marks.
   - `tnum` on every money cell as a signature convention.
   - Level 1 and Level 2 shadow recipes, which confirm Raised and Overlay.
   - Calm status colour: no red or green fills on neutral surfaces except the over-budget bar.
3. **Supabase** (`docs/design/references/supabase.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Supabase's marks.
   - One chromatic accent per screen.
   - Dark text on the accent fill where the accent is light, light text where it is dark, chosen per theme.
   - Small control radii (2px and 4px here) with a hairline only on inputs, never on cards.

## Decisions

One row per design-system decision in CLAUDE.md and per decision from the 2026-10-05 capture. `replaced` rows and the Focus Blue adjustment take effect only if ADR-0006 is accepted; on rejection every row reverts to `kept` except the dark Critical Red fix, and ## Fallback applies.

| Decision | Value |
|----------|-------|
| Type family: IBM Plex Sans (body) and IBM Plex Mono (numbers) | replaced (ADR-0006): system UI stack for words, system mono stack for figures. Plex was declared but never loaded, so this matches what users already see and costs no font download. Needs the constitution Principle VI amendment in T028 |
| Green accent `#1f6e5a` light / `#5fbf9f` dark | replaced (ADR-0006): Intaglio Teal `#1d3c46` light / `#2d6f72` dark, as the shell plate and the one accent. Needs the Principle VI amendment in T028 |
| Backgrounds `#f2f4f7` light / `#121820` dark | replaced (ADR-0006): Note Paper `#eef1ec` / Night Note `#0f161b`, tinted toward the teal |
| Status colour warn (`#a8641a`, already `#8f5810` light for AA) | kept: `#8f5810` light, `#d99a4e` dark |
| Status colour critical `#a83a2e` | adjusted: light `#a83a2e` kept; dark `#f0897c` (the old dark value equalled light and measured 2.8:1, failing AA) |
| Three theme states (bare `:root`, guarded system dark, explicit dark) | kept |
| Charts are hand-written SVG, single hue, budget ticks, red when over, table view | kept; the single-hue fill becomes a line hatch drawn with an SVG pattern, no library |
| Status colours are never chart series | kept |
| Lifted surfaces with two elevations (capture 2026-10-05) | kept: Raised and Overlay, tinted toward Plate Ink in light mode |
| Focus ring in its own blue (capture 2026-10-05) | adjusted: `#4c84d9` light / `#9cc3ff` dark, so the ring reaches 3:1 on the page, on Sheet and on the teal plate (the old pair could not reach 3:1 on the accent) |
| Ledger Desk character and North Star (capture 2026-10-05) | replaced (ADR-0006): "Security Print"; the Ledger Desk becomes ## Fallback |

## Motion

Motion is feedback and state change only. Nothing loops except the skeleton pulse, and nothing animates on page load.

- **What animates:** `opacity` and `transform` only. A toast enters (opacity plus 8px translate, `--motion-base`) and leaves (`--motion-fast`, `--ease-exit`); a sheet slides in from its edge (`--motion-slow`); a menu fades and scales from 0.98 (`--motion-fast`); the serial line on a focused row fades in with a 4px rise (`--motion-fast`); a pressed button moves 1px down (`--motion-fast`); tab underline and link colour change over `--motion-fast`.
- **What never animates:** table layout, row height, column width, text size, bar length on data arrival, the denomination's value, and anything the user did not cause.
- **Tokens:** `--motion-fast` 120ms, `--motion-base` 200ms, `--motion-slow` 280ms (the FR-007 ceiling); `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)` for entering, `--ease-exit` `cubic-bezier(0.4, 0, 1, 1)` for leaving.
- **Reduced motion:** all three durations become 0ms; the skeleton stops pulsing and shows at 6% steady; nothing is replaced by a different animation.
- Informed by the Magic UI MCP's motion patterns (ideas only, no code or dependency): of its catalogue only fade-in, short slide and number-ticker ideas fit, and the number ticker is rejected because a changing figure must never look like it is still settling.

## Taste dials

From `Skill: design-taste-frontend` (design read: daily-use finance product UI for one person on phone and desktop, trust-first, native CSS tokens and Desk's own Vue blocks), cross-checked against the `ui-ux-pro-max` run recorded in `docs/design/SHORTLIST.md`, whose "Exaggerated Minimalism" and landing-page pattern were rejected for an app screen.

- **Variance: 3.** A symmetric whole-column grid with one deliberate exception, the double-width denomination, because a money screen must be predictable before it is interesting.
- **Motion intensity: 3.** State changes and feedback only, never on load, because a figure that moves reads as a figure that is not final.
- **Visual density: 5.** A daily-app density between the owner's two guardrails: comfortable at 360 (44px targets, one figure per tile), compact at desktop review where rows drop to 32px but type never shrinks.

## Mock-ups

Coded mock-ups on the dev-only catalogue route (built in T027; preview deployments with `VITE_UI_CATALOGUE=true`):

- Month view, proposed: `/__ui/mockups/month-view` (also `?state=loading|empty|error` and `?fixture=edge`)
- Add expense, proposed: `/__ui/mockups/add-expense`
- Settings, proposed: `/__ui/mockups/settings`
- Month view, fallback (Ledger Desk refined): `/__ui/mockups/month-view-fallback`
- "Before" screenshots of the shipped screens: `docs/design/before/*.png` (T027)

## Fallback

The refinement variant, applied if ADR-0006 is rejected: the incumbent capture of 2026-10-05, "The Ledger Desk", refined. Every Decisions row is `kept` except dark Critical Red, an AA fix that applies either way. The Focus Blue adjustment belongs to the teal plate and does not carry over; the fallback keeps the capture's Focus Blue. The capture's five named rules apply unchanged: One Ink (Ledger Green), Status Is Not a Series, Focus Is Blue, Tabular Figures (IBM Plex Mono declared, system mono as delivered), Two Heights.

Fallback values (normative frontmatter if the fallback is chosen):

| Role | Light | Dark |
|------|-------|------|
| `--color-bg` (Grey Paper / Night Desk) | `#f2f4f7` | `#121820` |
| `--color-surface` (Sheet) | `#ffffff` | `#1a222c` |
| `--color-surface-raised` | `#ffffff` | `#212b37` |
| `--color-border` (Rule Line) | `#7a8594` | `#5b6877` |
| `--color-fg` (Ink) | `#121820` | `#f2f4f7` |
| `--color-fg-muted` | `#4a5663` | `#a9b4c2` |
| `--color-accent` (Ledger Green) | `#1f6e5a` | `#5fbf9f` |
| `--color-accent-fg` | `#ffffff` | `#121820` |
| `--color-focus` (Focus Blue) | `#1a5fb4` | `#7fb2ff` |
| `--color-warn` | `#8f5810` | `#d99a4e` |
| `--color-critical` | `#a83a2e` | `#f0897c` |
| `--color-selection` | `#cfe8e0` | `#1f3d36` |

Type: IBM Plex Sans and Mono as declared, on the same seven-step scale as above. Radii 4px, 8px, 12px. Shadows as in the capture.

What the fallback changes, and only this: tiles, panel frames and widget frames move from the 12% hairline to Raised; menus, dialogs and toasts sit on Overlay and the two stray third shadows go; the primary tile figure takes the Display role (FR-011); every off-scale literal (0.9rem, 0.85rem, 0.8rem, 0.6rem, 6px) maps onto the scale; motion follows ## Motion; every panel gets its designed skeleton, empty and error states; tap targets reach 44px at phone. One known gap stays in the fallback: the Focus Blue ring on a Ledger Green fill measures under 3:1, so focus on the primary button relies on the 2px offset placing the ring on the page ground.

## Building a new panel

Stub; completed in T046 (User Story 3).

1. Start from `PanelFrame` with a Title-role heading and the three state slots filled (Skeleton, EmptyState with one action, ErrorState with a `causeMessages` map).
2. Put every figure in `Tile` or `DataTable` so it inherits the figure face, tabular numerals and the serial line.
3. Lay out with spacing tokens and whole grid columns only; no colour, type or motion rule in the screen file.
4. Add a `.story.ts` beside any new block and a `SCREENS` entry in `tests/e2e/tests/visual.spec.ts`.
