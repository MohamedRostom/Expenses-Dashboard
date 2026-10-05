---
name: Desk (working name)
description: A multi-currency expense tracker; the incumbent system ported from the personal dashboard.
colors:
  ledger-green: "#1f6e5a"
  ledger-green-dark: "#5fbf9f"
  grey-paper: "#f2f4f7"
  night-desk: "#121820"
  ink: "#121820"
  ink-dark: "#f2f4f7"
  ink-muted: "#4a5663"
  ink-muted-dark: "#a9b4c2"
  sheet: "#ffffff"
  sheet-dark: "#1a222c"
  sheet-raised-dark: "#212b37"
  rule-line: "#7a8594"
  rule-line-dark: "#5b6877"
  focus-blue: "#1a5fb4"
  focus-blue-dark: "#7fb2ff"
  selection-mint: "#cfe8e0"
  selection-mint-dark: "#1f3d36"
  warn-amber: "#8f5810"
  warn-amber-dark: "#d99a4e"
  critical-red: "#a83a2e"
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
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "3rem"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  figure:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 400
    fontFeature: "tnum"
  figure-small:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "4px"
  control: "6px"
  md: "8px"
  lg: "12px"
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
components:
  button-primary:
    backgroundColor: "{colors.ledger-green}"
    textColor: "{colors.grey-paper}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.critical-red}"
    textColor: "{colors.grey-paper}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.grey-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px"
  tile:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    padding: "12px"
  widget-frame:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "12rem"
  tab:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "8px 4px"
  tab-selected:
    textColor: "{colors.ink}"
---

# Design System: Desk (working name)

<!-- Incumbent capture, 2026-10-05. Spec 004 T028 replaces this with the approved direction (ADR-0006); the source of truth for values is packages/ui/src/tokens.css. -->

## Overview

**Creative North Star: "The Ledger Desk"**

Desk is an accountant's well-kept desk. The paper is plain and cool grey. The numbers are written in a monospaced hand and stand in tidy columns, and one green ink marks what matters: the main action, the active page, and how much of a budget has been spent. Nothing on the desk is decorative, and every object earns its place by holding a figure, a choice or a status.

The pieces you touch feel tactile and confident. Actions are solid filled shapes, inputs have firm outlines, and surfaces lift off the paper rather than being drawn onto it. The density is that of a working tool: compact on desktop where the month is reviewed, and roomier on the phone, where tap targets grow to 44px for the quick add at the moment of payment. Colour is rationed: green for the one accent, amber and red only for warning and over-budget, and an eight-colour palette reserved for telling connected accounts apart.

Three theme states are built in. Light is the default; the system dark scheme applies unless the user chose light; and an explicit dark choice wins over both. Motion is short (120–280ms), uses a single easing curve, and drops to zero under reduced motion.

**Key Characteristics:**
- IBM Plex Sans for words, IBM Plex Mono with tabular numerals for every figure.
- A single accent, Ledger Green, at roughly 10% of a screen or less.
- Surfaces lift off the page with soft, close shadows.
- Charts are hand-written SVG in one hue, with a tick mark for each budget and a red fill only when over budget.
- Every panel has designed skeleton, empty and error states, and the error copy depends on the error code.

## Colors

A cool, nearly neutral paper-and-ink palette with one green ink and two status colours held strictly in reserve.

### Primary
- **Ledger Green** (`ledger-green` light, `ledger-green-dark` dark): the main button, the active nav link, the selected-tab underline and the fill of category bars. The dark variant is a lighter mint so it keeps contrast on Night Desk. Text on a green fill uses Grey Paper in light mode and Night Desk in dark mode.

### Neutral
- **Grey Paper** (`grey-paper`): the page background in light mode. It is cool and slightly blue, never warm cream.
- **Night Desk** (`night-desk`): the page background in dark mode, a blue-black.
- **Ink** (`ink` / `ink-dark`): body text and figures. Light Ink is the same value as Night Desk, and the two swap between themes.
- **Muted Ink** (`ink-muted` / `ink-muted-dark`): secondary labels, unselected tabs, "as of" stamps and basis lines.
- **Sheet** (`sheet`, `sheet-dark`, `sheet-raised-dark`): lifted surfaces such as tiles, panels and dialogs. In light mode a sheet is white on Grey Paper; dark mode has two steps, with raised sheets one step lighter.
- **Rule Line** (`rule-line` / `rule-line-dark`): borders on controls and the tab-list baseline. Hairline tile borders use the ink colour at 12% opacity rather than this token.
- **Focus Blue** (`focus-blue` / `focus-blue-dark`): the focus outline and nothing else. It is deliberately not green, so focus is never confused with "active".
- **Selection Mint** (`selection-mint` / `selection-mint-dark`): the background of selected rows and selected text.

### Status
- **Warn Amber** (`warn-amber` / `warn-amber-dark`): pending rate lookups, stale-data banners and approaching-budget states. It was darkened to #8f5810 in light mode to pass AA as text on Grey Paper.
- **Critical Red** (`critical-red`): over-budget bar fills and values, error titles and the danger button.

### Account palette
- **Eight account colours** (`palette-teal` through `palette-slate`) identify connected mail and calendar accounts. Each has a lighter dark-mode twin in `tokens.css`, and each is tested to reach at least 3:1 against the background in both themes. The ids match the server's `COLOUR_PALETTE`.

### Named Rules
**The One Ink Rule.** Ledger Green is the only accent. It marks the primary action, the current location and spend against budget, and nothing decorative.

**The Status Is Not a Series Rule.** Warn Amber and Critical Red never appear as a chart series, category colour or account colour. When red shows up, something is over budget or broken.

**The Focus Is Blue Rule.** The focus ring is Focus Blue, 2px, with a 2px offset, on every interactive element and in both themes.

## Typography

**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Figure Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** Plex Sans is an engineer's humanist sans, plain-spoken and slightly technical. Plex Mono is its sibling, so every amount reads like an entry in a ledger.

### Hierarchy
- **Display** (600, 2.5rem/3rem, −0.02em): the single headline figure or page title, at most once per screen.
- **Headline** (600, 1.75rem/2.25rem, −0.02em): page headings.
- **Title** (600, 1.125rem/1.75rem): panel and section headings.
- **Body** (400, 1rem/1.5rem): running text, form values and table cells.
- **Label** (600, 0.875rem/1.25rem): panel-frame headings, tabs and field labels. Smaller supporting text uses 0.75rem with Muted Ink.
- **Figure** (Plex Mono, tabular numerals, 1.25rem on tiles, down to 0.75rem for "as of" stamps): every money amount, rate, date stamp and count.

### Named Rules
**The Tabular Figures Rule.** Every amount, rate and date is set in Plex Mono with `font-variant-numeric: tabular-nums`, so columns of money align digit for digit. Amount inputs follow the same rule.

## Layout

The spacing scale is a 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96). Content is centred within a 72rem maximum width. The page gutter is 16px on phones and 32px from 768px up. From 1024px, the tiles sit in a single row and the category bars and entries table sit side by side, and nothing stretches past the maximum width.

Tap targets are 44px on phones (`--target-min`). On desktop, controls are at least 24px, and dense table rows and menu items may use 32px. The main nav is a single wrapping row of text links, which keeps every link reachable at 360px without a hamburger menu. Dashboard widgets have a fixed height (12rem), so figures arriving later never push the expenses down.

## Elevation & Depth

Surfaces are lifted. Tiles, panels and widget frames sit on the page as sheets with the soft raised shadow, and anything that floats above the page (menus, dialogs, toasts) takes the deeper overlay shadow. In dark mode the shadows deepen and the sheet colour steps lighter (Sheet, then raised Sheet), so depth reads even where a shadow barely shows.

### Shadow Vocabulary
- **Raised** (`box-shadow: 0 1px 2px rgb(18 24 32 / 0.08), 0 1px 3px rgb(18 24 32 / 0.06)`; dark `0 1px 2px rgb(0 0 0 / 0.4), 0 1px 3px rgb(0 0 0 / 0.3)`): tiles, panels and widget frames at rest.
- **Overlay** (`box-shadow: 0 8px 24px rgb(18 24 32 / 0.16), 0 2px 6px rgb(18 24 32 / 0.08)`; dark `0 8px 24px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.4)`): dialogs, menus, toasts and anything else above the page.

### Named Rules
**The Two Heights Rule.** There are exactly two elevations, raised and overlay. Don't invent a third shadow.

> Drift note: as of this capture, `Tile`, `PanelFrame`'s widget frame and the category panels still draw a 12% ink hairline border with no shadow, and only the shadow tokens exist. Bringing them up to Raised is a spec 004 refresh item, not a reason to drop this rule.

## Shapes

Corners are gently rounded: 6px on buttons and inputs, 8px on tiles, widget frames and panels, and 12px reserved for dialogs. Category bars are square-ended SVG rectangles. Spinners and status dots are the only circles. Borders are 1px.

## Components

### Buttons
Solid and decisive. A filled shape you can press with a thumb.
- **Shape:** gently rounded (6px), 1px border, with the icon and label inline 8px apart.
- **Primary:** a Ledger Green fill with Grey Paper text, 8px × 16px padding, at 0.9rem.
- **Secondary:** transparent with a 1px Ink outline and Ink text.
- **Ghost:** transparent with no border, for tertiary actions in toolbars and menus.
- **Danger:** a Critical Red fill, used only for destructive confirmations.
- **Small:** 0.75rem text with 4px × 12px padding.
- **States:** a Focus Blue 2px outline with a 2px offset. Disabled is 60% opacity with a not-allowed cursor. Loading shows an inline spinner (0.6s turn, slowed to 1.5s under reduced motion) and sets `aria-busy`.

### Inputs / Fields
A firm outline with the label above.
- **Style:** a 1px Ink border, 6px radius, 8px padding, on the page background. The label is 0.85rem and sits 4px above the field.
- **Amount variant:** Plex Mono with tabular numerals.
- **Focus:** the Focus Blue 2px ring with a 2px offset.
- **Error / Disabled:** the border turns Critical Red, with a 0.8rem error message below in Critical Red. Disabled is 60% opacity.

### Tiles
A single figure, labelled.
- **Corner and surface:** 8px on a Sheet, raised (see Elevation), with 12px padding and a maximum width of 20rem.
- **Content:** the label above (0.8rem, Muted), the value as a Figure (Plex Mono 1.25rem), and an optional basis line (0.75rem, Muted). An over-budget value turns Critical Red.

### Widget Frame (signature)
The dashboard's unit of composition: a fixed-height (12rem) sheet with a header row, made of a drag grip, a 0.85rem 600 title, a Plex Mono "as of" stamp, and a ⋯ menu that opens an overlay list. The body clips rather than grows. There are dedicated banner (Warn Amber, 0.75rem), empty and error states, and the error title is in Critical Red.

### Category Bars (signature chart)
Hand-written SVG. Each row has the category name on the left and spent/budget amounts in Plex Mono on the right, above a 0.75rem-tall bar. The track is Ink at 8% opacity, the fill is Ledger Green, and it turns Critical Red when spending passes the budget. A thin Ink tick marks the budget. A table view is always available.

### Tabs
An underline style. Labels are 0.875rem in Muted Ink and turn Ink on hover or when selected, and the selected tab gets a 2px Ledger Green underline on a Rule Line baseline. Colour transitions take 120ms. Tabs grow to 44px tall on phones.

### Navigation
A single wrapping row of text links at 0.9rem. Links sit at 75% opacity and become Ledger Green at full opacity when hovered or active. Sign out is pushed to the far end. There's no icon bar and no hamburger menu.

## Do's and Don'ts

### Do:
- **Do** set every amount, rate and date in Plex Mono with tabular numerals.
- **Do** keep Ledger Green to the primary action, the current location and spend fill.
- **Do** lift tiles, panels and widget frames with the Raised shadow, and use Overlay only for things above the page.
- **Do** use the 2px Focus Blue outline with a 2px offset on every interactive element.
- **Do** give every panel a skeleton, an empty state and an error state, with error copy chosen by error code.
- **Do** define colours as tokens in all three theme states (bare `:root`, system dark guarded by `:not([data-theme='light'])`, and explicit `[data-theme='dark']`).
- **Do** keep tap targets at 44px on phones.

### Don't:
- **Don't** add a chart library. Charts stay hand-written SVG in one hue, with budget ticks and a table view.
- **Don't** reuse Warn Amber or Critical Red as a chart series, category colour or account colour.
- **Don't** set money in proportional digits, Plex Sans or any other font.
- **Don't** add a third shadow height or a second accent colour.
- **Don't** use Ledger Green for focus. Focus is always blue.
