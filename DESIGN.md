---
name: Desk (working name)
description: A multi-currency expense tracker. Proposed identity "Concourse Board" (ADR-0006); the incumbent Ledger Desk is the fallback.
colors:
  signal-green: "#0e3d2a"
  signal-green-dark: "#2c7452"
  daylight-steel: "#e8eaeb"
  flap-black: "#0e1114"
  board-ink: "#14171b"
  letter-white: "#f2f2ee"
  steel-mid: "#4b535b"
  steel-light: "#a7adb3"
  flap: "#f6f7f7"
  flap-raised: "#ffffff"
  flap-dark: "#171b20"
  flap-raised-dark: "#1f242a"
  frame-line: "#6a727a"
  frame-line-dark: "#5d656e"
  focus-blue: "#4d80da"
  focus-blue-dark: "#a6caff"
  selection-green: "#d8e6de"
  selection-green-dark: "#20332b"
  delay-amber: "#8a5a00"
  delay-amber-dark: "#ffb000"
  cancel-red: "#b00020"
  cancel-red-dark: "#ff6b6b"
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
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.08em"
  figure:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: "1.75rem"
    fontFeature: "tnum"
  figure-small:
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
  board-header:
    backgroundColor: "{colors.flap-raised}"
    textColor: "{colors.board-ink}"
    padding: "12px 16px"
  button-primary:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.flap}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  button-danger:
    backgroundColor: "{colors.cancel-red}"
    textColor: "{colors.flap}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.flap-raised}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  departure-tile:
    backgroundColor: "{colors.flap-raised}"
    textColor: "{colors.board-ink}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "16px"
  tile:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.board-ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    padding: "16px"
  board-row:
    textColor: "{colors.board-ink}"
    typography: "{typography.figure}"
    padding: "8px 12px"
  panel-frame:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  tab:
    textColor: "{colors.steel-mid}"
    typography: "{typography.label}"
    padding: "12px 4px"
  tab-selected:
    textColor: "{colors.board-ink}"
---

# Design System: Desk (working name)

<!-- Spec 004 T025, 2026-10-05: the proposed direction. The frontmatter describes the proposed identity, whose values live in apps/web/src/catalogue/proposed-tokens.css (T026) until ADR-0006 is decided in T028. Shipped screens keep the incumbent values in packages/ui/src/tokens.css, recorded under ## Fallback. -->

## Overview

**Creative North Star: "Concourse Board"**

State: Proposed (ADR-0006 open; fallback is the Ledger Desk, see ## Fallback)

Desk reads like the departure board in a rail concourse. A thousand travellers read it in one glance because every row keeps the same columns, every figure sits in its own cell, and status is said once, in a fixed place, in a colour that means one thing: amber is delayed, red is cancelled. On Desk the rows are the month's entries ranked by date, the cells hold amounts in tabular figures, amber marks an expense whose rate is still pending, and red marks a category over budget. When a pending rate arrives, the converted amount flips into place, once.

**Character: legible, ordered, live, calm.** Legible from arm's length on a phone at a till. Ordered because columns never move, only their values. Live because the one motion on the screen is a value arriving. Calm because the board answers one question at a time and never shouts.

The world lends four things and only these: the palette (flap black and steel, letter white, delay amber, cancel red, plus one signal green for action), the type (system mono figures in fixed cells, small spaced capitals for column heads and tile labels, readable mixed-case words), the density of a board, and one signature move, the arrival flip. It never supplies layout, navigation or controls: no icon tab bar, no flap-cell typing in inputs, no brushed-steel texture, no vent grids. Dark mode is the board at night and is the reference rendering; light mode is the same board in daylight, flaps on steel. The owner's guardrails (2026-10-05): not decorative, not dense at 360 px, not sparse.

**Key Characteristics:**
- Entries as board rows: fixed columns (date, item, category, amount), amounts right-aligned in tabular mono, a real sortable `<table>`.
- A row lamp: a 4px leading bar in Delay Amber for a pending rate, in Cancel Red for an over-budget category. Status lives there and in its word, never as a series.
- The departure tile: the month's remaining budget at Display size, the largest figure on the screen.
- The arrival flip: a value that changes because new data arrived turns over once (`rotateX`, under 280ms); nothing else moves on its own.
- Column heads and tile labels in small spaced capitals; everything a person reads at length in mixed case.
- Lifted surfaces at two heights, crisp 2/4/8 px corners.

## Colors

A restrained palette with status at full strength: steel neutrals, one signal green for action, amber and red with the board's meanings.

### Primary
- **Signal Green** (`signal-green` light, `signal-green-dark` dark; `--color-accent`): the primary button, the current nav link's underline, the selected tab, and the fill of budget bars. Text on it is Flap (light) and Letter White (dark). It never means "on time"; it means "this is the action" and "this is spend".

### Neutral
- **Daylight Steel** (`daylight-steel`, `--color-bg`): the light ground, a cool steel grey.
- **Flap Black** (`flap-black`, `--color-bg` dark): the night board ground.
- **Board Ink / Letter White** (`board-ink`, `letter-white`; `--color-fg`): text and figures in light and dark.
- **Steel Mid / Steel Light** (`steel-mid`, `steel-light`; `--color-fg-muted`): column heads, labels, "as of" stamps.
- **Flap** (`flap`, `flap-raised`, `flap-dark`, `flap-raised-dark`; `--color-surface`, `--color-surface-raised`): tiles, panels and the header are flaps; inputs, menus and dialogs are raised flaps.
- **Frame Line** (`frame-line` / `frame-line-dark`, `--color-border`): control borders, the header rule, table head rules.
- **Focus Blue** (`focus-blue` / `focus-blue-dark`, `--color-focus`): the focus ring and nothing else; chosen to reach 3:1 on the ground, on a flap and on Signal Green in both themes.
- **Selection Green** (`selection-green` / `selection-green-dark`, `--color-selection`): selected rows and text.

### Status
- **Delay Amber** (`delay-amber` / `delay-amber-dark`, `--color-warn`): rate pending, stale data, approaching budget. The board's own amber in dark; darkened in light to pass AA as text.
- **Cancel Red** (`cancel-red` / `cancel-red-dark`, `--color-critical`): over budget, errors, the danger button. Lightened in dark to pass AA.

### Account palette
- **Eight account colours** (`palette-teal` to `palette-slate`) identify connected mail and calendar accounts; unchanged.

### Named Rules
**The One Signal Rule.** Signal Green is the only accent: the primary action, the current location, spend. Nothing decorative is green.

**The Status Is Not a Series Rule.** Delay Amber and Cancel Red appear only as a row lamp, a status word, an over-budget fill or an error, never as a chart series, category or account colour. On this board amber always means delayed and red always means cancelled or over.

**The Focus Is Blue Rule.** The focus ring is Focus Blue, 2px, with a 2px offset, on every interactive element in both themes.

## Typography

**Word Font:** the system UI stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`)
**Figure Font:** the system mono stack (`ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, Menlo, monospace`)

**Character:** the board's figures sit in fixed cells, which a tabular mono gives on every platform without a download. The board's condensed capitals are translated, not copied: column heads and tile labels are small spaced capitals in the UI face, and everything read at length stays mixed case, because all-caps rows are slow to read on a phone. IBM Plex was declared by the incumbent tokens but never loaded (no `@font-face` exists in the repo), so most users already see `system-ui`.

### Hierarchy
- **Display** (mono 600, 2.5rem/3rem, −0.02em, tabular): the departure tile's figure, once per screen; nothing on the screen is larger (FR-011).
- **Headline** (600, 1.75rem/2.25rem): page headings, sparingly; none above the departure tile.
- **Title** (600, 1.125rem/1.75rem): panel headings.
- **Body** (400, 1rem/1.5rem): running text, form values, the item column.
- **Label** (600, 0.75rem/1rem, capitals, +0.08em tracking): column heads, tile labels, tabs. The tracking value is a new token, `--tracking-wide`, which T026 proposes and adds to contracts/tokens.md.
- **Figure** (mono 500, 1.125rem/1.75rem, tabular): tile values; row amounts use the same face at Body size.
- **Figure small** (mono 400, 0.75rem/1rem, tabular): "as of" stamps, rate lines.

### Named Rules
**The Tabular Figures Rule.** Every amount, rate and date is set in the figure face with `font-variant-numeric: tabular-nums`, so columns align digit for digit. Amount inputs follow the same rule.

**The Fixed Columns Rule.** A column's position and width never change when its values do. Values change; the board does not.

## Layout

The spacing scale is a 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96). Content is centred within `--content-max` (72rem); the gutter is 16px on phones and 32px from 768px.

The board reflows by whole columns: at 360 the entries table drops to three columns (date, item with its category beneath, amount) and keeps them fixed; from 768 the category column returns; from 1024 tiles sit in one row (the departure tile spans two of four tile columns) and category bars sit beside the entries board. Every month and every category bar shares one budget scale.

The header is a raised flap strip with the month switcher, the wrapping row of text links and the add action; no icon tab bar, no hamburger. Tap targets are 44px on phones; desktop controls at least 24px; dense board rows and menu items 32px. Widgets keep their fixed 12rem height. At 360 the first viewport shows the header, the departure tile, the two smaller tiles and the head of the entries board.

## Elevation & Depth

Flaps lift off the board. Tiles, panels and widget frames are flaps on the Raised shadow; menus, dialogs, sheets and toasts take Overlay. In dark mode depth reads mostly from the flap steps (Flap, raised Flap) with deeper shadows. Light shadows are tinted toward Board Ink.

### Shadow Vocabulary
- **Raised** (`0 1px 2px rgb(20 23 27 / 0.08), 0 1px 3px rgb(20 23 27 / 0.06)`; dark `0 1px 2px rgb(0 0 0 / 0.45), 0 1px 3px rgb(0 0 0 / 0.35)`): tiles, panels, widget frames.
- **Overlay** (`0 8px 24px rgb(20 23 27 / 0.16), 0 2px 6px rgb(20 23 27 / 0.08)`; dark `0 8px 24px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.45)`): dialogs, sheets, menus, toasts.

### Named Rules
**The Two Heights Rule.** Exactly two elevations, Raised and Overlay. Board rows themselves are flat; only the frame around the board is raised.

## Shapes

Corners are crisp: 2px on buttons, inputs and tabs (`--radius-sm`), 4px on tiles and panels (`--radius-md`), 8px on dialogs and sheets (`--radius-lg`). Borders are 1px. The departure tile's figure cell carries one 1px seam across its middle in Frame Line at 40%, the only flap-cell detail in the system. Budget bars are square-ended SVG rectangles, single-hue Signal Green, solid Cancel Red past the budget. Row lamps are 4px square-ended bars. Spinners and status dots are the only circles.

## Components

Block conventions (every block in `packages/ui/src/components/`, contracts/blocks.md):

- **Naming and props:** PascalCase blocks; visual choice only through `variant`, `size` and `density`.
- **State props:** `loading`, `empty`, `error` (`{ cause }`), with copy from a `causeMessages` map; last content stays visible under an error.
- **Focus:** `:focus-visible` outline `2px solid var(--color-focus)`, offset 2px.
- **Targets:** 44px at phone; 32px only in `DataTable` dense rows and `MenuButton` menus at desktop.
- **Density dial:** `comfortable` (default, phone) and `compact` (desktop review); compact removes one spacing step of vertical padding, never type size.
- **Figures:** any number renders in `--font-mono` with `tabular-nums`.

### Buttons
Square-shouldered and solid. Primary is Signal Green with Flap text; secondary a 1px Board Ink outline; ghost borderless; danger Cancel Red. 44px tall at phone, label in mixed case at 0.875rem 600 (buttons are read, not scanned). Loading keeps the width with an inline spinner and `aria-busy`; pressed moves 1px down.

### Inputs / Fields
Raised flap, 1px Frame Line border, 2px radius, Label-role caption above, error below in Cancel Red via `aria-describedby`. The amount variant is right-aligned in the figure face with the currency code as a leading adornment.

### Select
Native-backed, styled like Input.

### Dialog (the sheet)
Bottom sheet at phone, side panel from 1024, centred for confirmations; raised flap on Overlay, 8px radius on free edges, Board Ink scrim at 40%.

### Toast
Raised flap on Overlay with a 4px leading lamp in its status colour (green for saved, amber, red), undo as a ghost button.

### Tile and the Departure Tile (signature)
A tile is a flap with a Label-role caption, a Figure and an optional small figure line ("as of 09:07"). The departure tile is the remaining budget at Display size on a raised flap with the one seam; its caption reads "LEFT THIS MONTH" and its line gives the budget and days left. Over budget, its figure turns Cancel Red, a leading minus is shown and the line says "over", so colour is never the only signal.

### DataTable (the board)
A real `<table>` with a caption: Label-role column heads over a Frame Line, rows separated by space, amounts right-aligned in the figure face, fixed column widths. A row with a pending rate carries the amber lamp and the word "rate pending" in its amount cell; when the rate arrives, the converted amount flips in. Rows sort by their header buttons with `aria-sort`.

### Category Bars (chart)
Hand-written SVG. Name left (truncated, full name in the accessible name), spent and budget right in the figure face, single-hue bar below, a 1px Board Ink tick at the budget, solid Cancel Red past it, and the red row lamp on the category. A table view is always one tab away.

### PanelFrame
Titled flap on Raised: Title heading, optional `MenuButton`, body, and the Skeleton, EmptyState and ErrorState slots; the compact widget variant keeps 12rem.

### Tabs
Label-role capitals in Steel Mid, Board Ink when selected with a 2px Signal Green underline on a Frame Line baseline; 44px tall at phone.

### Navigation
In the header: a wrapping row of mixed-case text links at 0.875rem 600; the current page has a 2px Signal Green underline. Sign out at the far end. No icon bar, no hamburger.

### MenuButton, ThemeToggle, Skeleton, EmptyState, ErrorState, Kbd
MenuButton is a ghost icon button opening an Overlay menu; ThemeToggle a segmented radiogroup; Skeleton blocks are blank flaps (Board Ink at 6%) that pulse in opacity, static under reduced motion; EmptyState and ErrorState use Title and Body with one action; Kbd is figure-small on a raised flap.

## Do's and Don'ts

### Do:
- **Do** keep columns fixed: values change, the board does not.
- **Do** make the departure tile the largest figure on the screen, once.
- **Do** say status twice, once as a lamp and once as a word.
- **Do** flip a value only when new data arrives for it, once, under 280ms.
- **Do** set every amount, rate and date in the figure face with tabular numerals.
- **Do** keep column heads and labels in small spaced capitals and everything else in mixed case.
- **Do** lift tiles and panels with Raised and use Overlay only above the page.
- **Do** define colours as tokens in all three theme states.

### Don't:
- **Don't** add brushed steel, vent grids, flap textures, a split-flap font or per-character flips. The world lends type, palette, density and the arrival flip only.
- **Don't** use an icon tab bar or set inputs and buttons in flap cells.
- **Don't** use amber or red for anything but delayed, pending, over budget or broken.
- **Don't** add a chart library, a third shadow, a second accent or a second figure face.
- **Don't** animate on load, on scroll, or a value the user did not cause to change.
- **Don't** use green for focus; focus is always blue.

## References

At most three, used for principles and scales only; no logo, illustration, icon or brand asset is copied. Full reasoning in `docs/design/SHORTLIST.md`.

1. **Linear** (`docs/design/references/linear.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Linear's marks.
   - A stepped dark surface ladder, which becomes the flap steps of the night board.
   - Weight capped at 600 and a small-step type ramp.
   - 44px touch controls.
2. **Stripe** (`docs/design/references/stripe.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Stripe's marks.
   - `tnum` on every money cell.
   - Level 1 and Level 2 shadow recipes, which confirm Raised and Overlay.
   - Status said in words as well as colour.
3. **Supabase** (`docs/design/references/supabase.DESIGN.md`). Licence: MIT (awesome-design-md collection, copyright 2026 VoltAgent), covering the text, not Supabase's marks.
   - One chromatic accent per screen, a green.
   - Light and dark designed together, with the accent's text colour chosen per theme.
   - Small control radii (2px and 4px here).

## Decisions

One row per design-system decision in CLAUDE.md and per decision from the 2026-10-05 capture. `replaced` rows and the Focus Blue and warn adjustments take effect only if ADR-0006 is accepted; on rejection every row reverts to `kept` except the dark critical AA fix, and ## Fallback applies.

| Decision | Value |
|----------|-------|
| Type family: IBM Plex Sans (body) and IBM Plex Mono (numbers) | replaced (ADR-0006): system UI stack for words, system mono stack for figures; Plex was declared but never loaded. Needs the constitution Principle VI amendment in T028 |
| Green accent `#1f6e5a` light / `#5fbf9f` dark | replaced (ADR-0006): Signal Green `#0e3d2a` light / `#2c7452` dark, still a green and still the only accent. Needs the Principle VI amendment in T028 |
| Backgrounds `#f2f4f7` light / `#121820` dark | replaced (ADR-0006): Daylight Steel `#e8eaeb` / Flap Black `#0e1114` |
| Status colour warn (`#a8641a`, already `#8f5810` light for AA) | adjusted: Delay Amber `#8a5a00` light / `#ffb000` dark, the board's amber, still AA as text |
| Status colour critical `#a83a2e` | adjusted: Cancel Red `#b00020` light / `#ff6b6b` dark; the old dark value equalled light and measured 2.8:1, failing AA |
| Three theme states (bare `:root`, guarded system dark, explicit dark) | kept; dark is the reference rendering, light the daylight board |
| Charts are hand-written SVG, single hue, budget ticks, red when over, table view | kept |
| Status colours are never chart series | kept; status gains the row lamp, which is a state marker, not a series |
| Lifted surfaces with two elevations (capture 2026-10-05) | kept: Raised and Overlay; board rows stay flat inside a raised frame |
| Focus ring in its own blue (capture 2026-10-05) | adjusted: `#4d80da` light / `#a6caff` dark, reaching 3:1 on the ground, a flap and Signal Green |
| Ledger Desk character and North Star (capture 2026-10-05) | replaced (ADR-0006): "Concourse Board"; the Ledger Desk becomes ## Fallback |

## Motion

Motion says one thing: a value arrived. Nothing animates on load, on scroll or on hover beyond a colour change.

- **The arrival flip (signature):** when a pending amount receives its rate, or a tile's figure changes because data refreshed, the figure's cell turns over once: `transform: rotateX(90deg)` to `0` over `--motion-base` with `--ease-standard`, `transform-origin` at the cell's seam. One flip per value per update; never per character, never on first render, never in a loop.
- **Other state changes:** toast enters with opacity and an 8px translate (`--motion-base`) and leaves on `--motion-fast` with `--ease-exit`; a sheet slides from its edge (`--motion-slow`); a menu fades and scales from 0.98 (`--motion-fast`); a pressed button moves 1px (`--motion-fast`); tab and link colour over `--motion-fast`.
- **What never animates:** column width, row height, table layout, text size, bar length on data arrival, sorting, and anything the user did not cause.
- **Tokens:** `--motion-fast` 120ms, `--motion-base` 200ms, `--motion-slow` 280ms (the FR-007 ceiling); `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`, `--ease-exit` `cubic-bezier(0.4, 0, 1, 1)`.
- **Reduced motion:** durations are 0ms, so the flip becomes an instant swap and the skeleton holds still; nothing is replaced by another effect.
- Informed by the Magic UI MCP's motion patterns (ideas only, no code or dependency): its flip and ticker patterns were weighed and cut down to a single whole-cell flip, because a per-character cascade on money reads as a value that is still settling.

## Taste dials

From `Skill: design-taste-frontend` (design read: daily-use finance product UI for one person on phone and desktop, trust-first, native CSS tokens and Desk's own Vue blocks), cross-checked against the `ui-ux-pro-max` run recorded in `docs/design/SHORTLIST.md`, whose landing-page pattern and second accent were rejected.

- **Variance: 3.** A fixed-column board is symmetric by nature; the only exception is the double-width departure tile.
- **Motion intensity: 3.** One signature flip on data arrival plus feedback, because the board's life is its values, not its chrome.
- **Visual density: 5.** Board rows are denser than cards but stay readable at 360: three columns, 44px rows on the phone, 32px compact rows at desktop.

## Mock-ups

Coded mock-ups on the dev-only catalogue route (built in T027; preview deployments with `VITE_UI_CATALOGUE=true`):

- Month view, proposed: `/__ui/mockups/month-view` (also `?state=loading|empty|error` and `?fixture=edge`)
- Add expense, proposed: `/__ui/mockups/add-expense`
- Settings, proposed: `/__ui/mockups/settings`
- Month view, fallback (Ledger Desk refined): `/__ui/mockups/month-view-fallback`
- "Before" screenshots of the shipped screens: `docs/design/before/*.png` (T027)

## Fallback

The refinement variant, applied if ADR-0006 is rejected: the incumbent capture of 2026-10-05, "The Ledger Desk", refined. Every Decisions row is `kept` except dark Critical Red, an AA fix that applies either way; the Focus Blue and status-colour adjustments belong to the board and do not carry over. The capture's five named rules apply unchanged: One Ink (Ledger Green), Status Is Not a Series, Focus Is Blue, Tabular Figures, Two Heights.

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

Type: IBM Plex Sans and Mono as declared, on the seven-step scale above. Radii 4px, 8px, 12px. Shadows as in the capture.

What the fallback changes, and only this: tiles, panel frames and widget frames move from the 12% hairline to Raised; menus, dialogs and toasts sit on Overlay and the two stray third shadows go; the primary tile figure takes the Display role (FR-011); every off-scale literal (0.9rem, 0.85rem, 0.8rem, 0.6rem, 6px) maps onto the scale; motion follows ## Motion without the arrival flip; every panel gets its designed skeleton, empty and error states; tap targets reach 44px at phone. One known gap stays: Focus Blue on a Ledger Green fill is under 3:1, so focus on the primary button relies on the 2px offset placing the ring on the page ground.

## Building a new panel

Stub; completed in T046 (User Story 3).

1. Start from `PanelFrame` with a Title heading and the three state slots filled (Skeleton, EmptyState with one action, ErrorState with a `causeMessages` map).
2. Put every figure in `Tile` or `DataTable` so it inherits the figure face, tabular numerals, fixed columns and the arrival flip.
3. Say status with a row lamp and a word, never colour alone.
4. Lay out with spacing tokens and whole columns only; no colour, type or motion rule in the screen file.
5. Add a `.story.ts` beside any new block and a `SCREENS` entry in `tests/e2e/tests/visual.spec.ts`.
