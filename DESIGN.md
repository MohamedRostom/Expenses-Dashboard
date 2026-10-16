---
name: Desk (working name)
description: A multi-currency expense tracker. Identity "Premium identity with ambient motion" (ADR-0007, accepted 2026-10-16), superseding "Concourse Board" (ADR-0006).
colors:
  signal-green: "#0e3d2a"
  signal-green-dark: "#2c7452"
  accent-concourse-blue: "#11325f"
  accent-concourse-blue-dark: "#2368c7"
  accent-platform-teal: "#083a38"
  accent-platform-teal-dark: "#117471"
  accent-violet: "#432664"
  accent-violet-dark: "#8451bd"
  accent-slate: "#2a333c"
  accent-slate-dark: "#586b7e"
  accent-plum: "#511f4b"
  accent-plum-dark: "#a63f99"
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
  glass: "rgb(246 247 247 / 0.72)"
  glass-dark: "rgb(23 27 32 / 0.62)"
  glass-line: "rgb(20 23 27 / 0.1)"
  glass-line-dark: "rgb(242 242 238 / 0.11)"
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
  xl: "16px"
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
    backgroundColor: "{colors.flap}"
    textColor: "{colors.board-ink}"
    typography: "{typography.display}"
    rounded: "{rounded.xl}"
    padding: "20px"
  tile:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.board-ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.xl}"
    padding: "20px"
  board-row:
    textColor: "{colors.board-ink}"
    typography: "{typography.figure}"
    padding: "8px 12px"
  panel-frame:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  tab:
    textColor: "{colors.steel-mid}"
    typography: "{typography.label}"
    padding: "12px 4px"
  tab-selected:
    textColor: "{colors.board-ink}"
---

# Design System: Desk (working name)

<!-- Spec 004 T025, 2026-10-05; approved 2026-10-10 (T028, ADR-0006). Rewritten for ADR-0007 by spec 006 T003 and approved by the owner on 2026-10-16 (T004). The frontmatter is normative and its values live in packages/ui/src/tokens.css; the glass, radius and motion values named in the body join the frontmatter in T007, when they reach tokens.css. -->

## Overview

**Creative North Star: "Premium identity with ambient motion"**

State: Approved (ADR-0007 accepted 2026-10-16, superseding ADR-0006 "Concourse Board")

Desk is a calm, premium place to read the month's money. The figures sit on translucent panels with soft 16px corners, and behind them a slow ambient layer, chosen by the user, keeps the page alive without asking to be read. The board's discipline stays: every row keeps its columns, every figure sits in tabular mono, and status is said once, in a fixed place, in a colour that means one thing: amber is pending, red is over. When a pending rate arrives, the converted amount flips into place, once.

**Character: premium, calm, legible, alive.** Premium because surfaces have depth and finish, not decoration. Calm because the background moves slowly, at low strength, and stops whenever the person or the device asks. Legible because the figures are always the loudest thing on the screen and every text pair meets AA over every preset and colour. Alive because the ground breathes behind the content, and values still arrive with the flip.

The background is felt, not read. It never carries information, never sits above content, never takes input and never competes with a figure. A user picks one of five presets (None, Aurora drift, Board grid, Particles, Grain; Particles by default), may pick its colour in light mode, may turn the panels opaque, and may pause it. The rail-board world of ADR-0006 lends what carries over: its type, its status palette, its fixed columns and the arrival flip. The owner's guardrails still hold (2026-10-05): not decorative, not dense at 360 px, not sparse.

**Key Characteristics:**
- Translucent panels: tiles, panels and widget frames are frosted glass (Flap at 72 % light, 62 % dark, 20px backdrop blur) with 16px corners, falling back to opaque Flap of the same colour.
- One ambient background layer behind every screen, user-chosen, slow, pausable, still under reduced motion.
- Panels reflow by width: one column at 360, two at 768, the full grid on desktop, never wider than 1160px.
- Entries as board rows: fixed columns (date, item, category, amount), amounts right-aligned in tabular mono, a real sortable `<table>`.
- A row lamp: a 4px leading bar in Delay Amber for a pending rate, in Cancel Red for an over-budget category. Status lives there and in its word, never as a series or a tint.
- The departure tile: the month's remaining budget at Display size, the largest figure on the screen.
- The arrival flip: a value that changes because new data arrived turns over once (`rotateX`, under 280ms).
- Column heads and tile labels in small spaced capitals; everything a person reads at length in mixed case.

## Colors

A restrained palette with status at full strength: steel neutrals, one signal green for action, amber and red with the board's meanings.

### Primary
- **Signal Green** (`signal-green` light, `signal-green-dark` dark; `--color-accent`): the primary button, the current nav link's underline, the selected tab, and the fill of budget bars. Text on it is Flap (light) and Letter White (dark). It never means "on time"; it means "this is the action" and "this is spend".

### Accent presets (FR-019)
Signal Green is the default. A user may pick one of five alternatives (`data-accent` on `<html>`), which override only `--color-accent`, `--color-accent-fg` and `--color-selection`; contrast pairs are asserted for every preset in all three theme states, and no preset hue falls in 0 to 60 degrees (the amber and red status range).

| Preset | Light | Dark |
|---|---|---|
| `concourse-blue` | `#11325f` | `#2368c7` |
| `platform-teal` | `#083a38` | `#117471` |
| `violet` | `#432664` | `#8451bd` |
| `slate` | `#2a333c` | `#586b7e` |
| `plum` | `#511f4b` | `#a63f99` |

### Neutral
- **Daylight Steel** (`daylight-steel`, `--color-bg`): the light ground, a cool steel grey.
- **Flap Black** (`flap-black`, `--color-bg` dark): the night board ground.
- **Board Ink / Letter White** (`board-ink`, `letter-white`; `--color-fg`): text and figures in light and dark.
- **Steel Mid / Steel Light** (`steel-mid`, `steel-light`; `--color-fg-muted`): column heads, labels, "as of" stamps.
- **Flap** (`flap`, `flap-raised`, `flap-dark`, `flap-raised-dark`; `--color-surface`, `--color-surface-raised`): the opaque surfaces. Inputs, menus, dialogs, sheets and toasts are raised Flap and stay opaque for legibility; tiles, panels and widget frames use Glass, with opaque Flap as their fallback.
- **Glass** (`--color-surface-glass`: `rgb(246 247 247 / 0.72)` light, `rgb(23 27 32 / 0.62)` dark; `--blur-surface` 20px with `saturate(140%)`): Flap made translucent for tiles, panels and widget frames. Its edge is a hairline `--color-glass-line` (`rgb(20 23 27 / 0.1)` light, `rgb(242 242 238 / 0.11)` dark). Opacity never drops below 0.66 light or 0.58 dark, which is what keeps text AA over every preset. Under `@supports not (backdrop-filter: blur(1px))`, or when the user turns "Translucent panels" off (`:root[data-panels="solid"]`), Glass becomes `--color-surface-raised`.
- **Frame Line** (`frame-line` / `frame-line-dark`, `--color-border`): control borders, the header rule, table head rules.
- **Focus Blue** (`focus-blue` / `focus-blue-dark`, `--color-focus`): the focus ring and nothing else; chosen to reach 3:1 on the ground, on a flap and on Signal Green in both themes.
- **Selection Green** (`selection-green` / `selection-green-dark`, `--color-selection`): selected rows and text.

### Status
- **Delay Amber** (`delay-amber` / `delay-amber-dark`, `--color-warn`): rate pending, stale data, approaching budget. The board's own amber in dark; darkened in light to pass AA as text.
- **Cancel Red** (`cancel-red` / `cancel-red-dark`, `--color-critical`): over budget, errors, the danger button. Lightened in dark to pass AA.

### Account palette
- **Eight account colours** (`palette-teal` to `palette-slate`) identify connected mail and calendar accounts; unchanged.

### Motion colour (background tint)
The tint of the background layer, separate from the accent. Shown and chosen only in light mode; dark mode always draws Signal mint at its dark strength, and the user's light choice is kept and restored. Set as `--motion-tint` on `<html>`.

| Swatch | Value |
|---|---|
| Signal mint (default, and the fixed dark tint) | `#7fd1a8` |
| Platform blue | `#8fb3ff` |
| Lamp amber | `#f5c27a` |
| Dusk violet | `#c9a7ff` |
| Coral | `#ff9fb2` |
| Silver | `#e9edf2` |
| Custom | any `#rrggbb`, stored lowercase |

A custom colour is never rejected. Contrast is held by structure: the tint is drawn at capped alphas (see ## Motion, Background layer) under panels of minimum opacity, and a unit test composites the worst case for every preset, every swatch, `#ffffff` and `#000000`, both themes and both panel modes. Lamp amber is a pale background tint, not the status amber, and is never used for status, a series or an accent.

### Named Rules
**The One Signal Rule.** One accent at a time, Signal Green by default, user-selectable from the presets (see Accent presets): the primary action, the current location, spend. Nothing decorative takes the accent, and no preset hue is an amber or red status hue.

**The Status Is Not a Series Rule.** Delay Amber and Cancel Red appear only as a row lamp, a status word, an over-budget fill or an error, never as a chart series, category, account colour or motion tint. Amber always means pending and red always means over or broken.

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

Panels reflow by width through one shared rule, `.board-grid` in `packages/ui` (`grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))`, `max-width: 1160px`): one column at 360, two at 768, the full grid on desktop, with no breakpoints. Tile rows keep `minmax(220px, 1fr)`. No screen scrolls sideways at 360, 768 or 1280; a wide table scrolls inside `DataTable`'s own box.

Inside a panel the board still reflows by whole columns: at 360 the entries table drops to three columns (date, item with its category beneath, amount) and keeps them fixed; from 768 the category column returns; from 1024 tiles sit in one row (the departure tile spans two of four tile columns) and category bars sit beside the entries board. Every month and every category bar shares one budget scale.

Between those column steps the board is fluid (T027a): the Display figure scales with `clamp()` from 2rem at 360 to 2.5rem at 1280 (`--text-display-fluid`), the gutter from 16px to 32px (`--gutter-fluid`), and tiles, panels and widgets lay out by container queries on their own width rather than the viewport, so the same widget reads correctly in a 360 strip, a two-up row or a wide column. Whole-column changes still happen at fixed steps, so a column never slides.

The background layer covers the whole viewport (`position: fixed`), so long pages scroll over it and it never moves with scroll. The header is a raised flap strip with the month switcher, the wrapping row of text links and the add action; no icon tab bar, no hamburger. Tap targets are 44px on phones; desktop controls at least 24px; dense board rows and menu items 32px. Widgets keep their fixed 12rem height. At 360 the first viewport shows the header, the departure tile, the two smaller tiles and the head of the entries board.

## Elevation & Depth

Three planes, back to front: the ground with its background layer, glass panels floating over it, and opaque overlays above the page. Tiles, panels and widget frames are Glass on the Raised shadow; menus, dialogs, sheets and toasts are opaque raised Flap on Overlay, so nothing moves behind text a person is acting on. In dark mode depth reads from the blur and a faint inner top highlight with deeper shadows. Light shadows are tinted toward Board Ink.

### Shadow Vocabulary
- **Raised** (`0 1px 2px rgb(20 23 27 / 0.06), 0 16px 40px rgb(20 23 27 / 0.08)`; dark `inset 0 1px 0 rgb(255 255 255 / 0.04), 0 16px 40px rgb(0 0 0 / 0.38)`): tiles, panels, widget frames. Softer and wider than ADR-0006's, because a floating glass panel casts a diffuse shadow.
- **Overlay** (`0 8px 24px rgb(20 23 27 / 0.16), 0 2px 6px rgb(20 23 27 / 0.08)`; dark `0 8px 24px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.45)`): dialogs, sheets, menus, toasts.

### Named Rules
**The Two Heights Rule.** Exactly two elevations, Raised and Overlay. Board rows themselves are flat; only the frame around the board is raised.

## Shapes

Panels are soft and controls stay crisp: 16px on tiles, panels and widget frames (`--radius-xl`), 8px on dialogs and sheets (`--radius-lg`), 4px where ADR-0006 used it inside panels (`--radius-md`), 2px on buttons, inputs and tabs (`--radius-sm`). Borders are 1px; a glass panel's border is the Glass line. The departure tile's flap-cell seam is retired: its figure sits directly on the glass. Budget bars are square-ended SVG rectangles, single-hue Signal Green, solid Cancel Red past the budget. Row lamps are 4px square-ended bars. Spinners and status dots are the only circles.

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
A tile is a glass panel with a Label-role caption, a Figure and an optional small figure line ("as of 09:07"). The departure tile is the remaining budget at Display size on a glass panel edged with a 1px accent ring; its caption reads "LEFT THIS MONTH" and its line gives the budget and days left. Over budget, its figure turns Cancel Red, a leading minus is shown and the line says "over", so colour is never the only signal.

### DataTable (the board)
A real `<table>` with a caption: Label-role column heads over a Frame Line, rows separated by space, amounts right-aligned in the figure face, fixed column widths. A row with a pending rate carries the amber lamp and the word "rate pending" in its amount cell; when the rate arrives, the converted amount flips in. Rows sort by their header buttons with `aria-sort`.

### Category Bars (chart)
Hand-written SVG. Name left (truncated, full name in the accessible name), spent and budget right in the figure face, single-hue bar below, a 1px Board Ink tick at the budget, solid Cancel Red past it, and the red row lamp on the category. A table view is always one tab away.

### PanelFrame
Titled glass panel on Raised (the shared `.surface` rule, 16px corners): Title heading, optional `MenuButton`, body, and the Skeleton, EmptyState and ErrorState slots; the compact widget variant keeps 12rem.

### Tabs
Label-role capitals in Steel Mid, Board Ink when selected with a 2px Signal Green underline on a Frame Line baseline; 44px tall at phone.

### Navigation
In the header: a wrapping row of mixed-case text links at 0.875rem 600; the current page has a 2px Signal Green underline. Sign out at the far end. No icon bar, no hamburger.

### BackgroundMotion
The one background layer: fixed behind the app root, `aria-hidden="true"`, `pointer-events: none`, below every content layer, hidden in print. It renders the preset named by `data-motion` on `<html>` (`none`, `aurora`, `grid`, `particles`, `grain`) in `--motion-tint`, and holds still under `data-motion-paused`. Mounted once by the web app and once by the landing site; screens never draw their own background.

### Appearance settings
In Settings › Appearance, behind `appearance.motion`: a "Background motion" radiogroup of the five presets, each with its name and one line; a "Motion colour" radiogroup of the six named swatches plus a "Custom colour" input, shown in light mode only and disabled with "Applies when a motion is on" while the preset is None; and two switches, "Translucent panels" and "Pause background motion". Every control is 44px. A failed save keeps the preview, shows an alert next to the group with copy by error code and a "Try again" button.

### MenuButton, ThemeToggle, Skeleton, EmptyState, ErrorState, Kbd
MenuButton is a ghost icon button opening an Overlay menu; ThemeToggle a segmented radiogroup; Skeleton blocks are blank flaps (Board Ink at 6%) that pulse in opacity, static under reduced motion; EmptyState and ErrorState use Title and Body with one action; Kbd is figure-small on a raised flap.

## Do's and Don'ts

### Do:
- **Do** keep columns fixed: values change, the board does not.
- **Do** make the departure tile the largest figure on the screen, once.
- **Do** say status twice, once as a lamp and once as a word.
- **Do** flip a value only when new data arrives for it, once, under 280ms.
- **Do** keep every single animation under 280ms and switch all of it off under reduced motion.
- **Do** set every amount, rate and date in the figure face with tabular numerals.
- **Do** keep column heads and labels in small spaced capitals and everything else in mixed case.
- **Do** lift tiles and panels with Raised and use Overlay only above the page.
- **Do** keep dialogs, menus, sheets and toasts opaque; glass is for panels only.
- **Do** keep the background slow and faint: the figures are always the loudest thing on the screen.
- **Do** stop the background whenever the user pauses it, the system asks for reduced motion or reduced data, or the tab is hidden.
- **Do** define colours as tokens in all three theme states.

### Don't:
- **Don't** add brushed steel, vent grids, flap textures, a split-flap font or per-character flips.
- **Don't** add a second background, a per-screen background, parallax, or a background that reacts to the pointer or to data.
- **Don't** animate anything in the background but `transform` and `opacity`, or use a script loop, canvas or WebGL for it.
- **Don't** use Delay Amber or Cancel Red as a motion tint, or let the background carry meaning.
- **Don't** use an icon tab bar or set inputs and buttons in flap cells.
- **Don't** use amber or red for anything but delayed, pending, over budget or broken.
- **Don't** add a chart library, a third shadow, a second accent or a second figure face.
- **Don't** animate on scroll, loop anything but the skeleton pulse and the background layer, count figures up, or settle a page in more than once per load.
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

One row per design-system decision in CLAUDE.md and per decision from the 2026-10-05 capture. Rows marked ADR-0006 took effect on 2026-10-10. Rows marked ADR-0007 take effect only when ADR-0007 is accepted; on rejection they revert and ## Fallback applies.

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
| Lifted surfaces with two elevations (capture 2026-10-05) | adjusted (ADR-0007): still Raised and Overlay, but Raised panels are translucent glass with 16px corners and a softer, wider shadow; overlays stay opaque |
| Focus ring in its own blue (capture 2026-10-05) | adjusted: `#4d80da` light / `#a6caff` dark, reaching 3:1 on the ground, a flap and Signal Green |
| Ledger Desk character and North Star (capture 2026-10-05) | replaced (ADR-0006, then ADR-0007): "Concourse Board", now "Premium identity with ambient motion" |
| Nothing loops except the skeleton pulse (ADR-0006) | replaced (ADR-0007): exactly one more loop, the opt-in background layer, still under reduced motion, reduced data, the user's pause and a hidden tab |
| Board columns stepping at 360/768/1024 (ADR-0006) | adjusted (ADR-0007): panels reflow through `.board-grid` (1, 2, full grid; max 1160px); columns inside a table still step and stay fixed |
| Departure tile flap-cell seam (ADR-0006, T027) | replaced (ADR-0007): retired; the figure sits on glass with a 1px accent ring on the tile |

## Motion

Motion says what changed and where it went. The arrival flip stays the signature; around it, the board settles in once on load, sheets and menus travel from their source, lists make room for what was added or removed, and a tile lifts slightly under a pointer. Raised from intensity 3 to 5 by the owner after reviewing the T027 mock-ups (2026-10-06, T027a).

- **The arrival flip (signature):** when a pending amount receives its rate, or a tile's figure changes because data refreshed, the figure's cell turns over once: `transform: rotateX(90deg)` to `0` over `--motion-base` with `--ease-standard`, `transform-origin` at the cell's seam. One flip per value per update; never per character, never on first render, never in a loop.
- **Other state changes:** toast enters with opacity and an 8px translate (`--motion-base`) and leaves on `--motion-fast` with `--ease-exit`; a sheet slides from its edge (`--motion-slow`); a menu fades and scales from 0.98 (`--motion-fast`); a pressed button moves 1px (`--motion-fast`); tab and link colour over `--motion-fast`.
- **Settle-in on first load (T027a):** each panel and tile fades from 0 and rises 8px over `--motion-base`, staggered by `--motion-stagger` (40ms) in reading order, at most six steps, so the whole page has settled by 440ms from paint and no single animation passes 280ms. It runs once per page load, never on a re-render, never on scroll.
- **Lists (T027a):** an added row or widget enters with opacity and an 8px drop over `--motion-base`; a removed one collapses over `--motion-fast` with `--ease-exit`; the others glide to their new places (FLIP) over `--motion-base`. Widget reorder glides the same way, by drag or by the keyboard move buttons. Sorting a table still never animates (fixed columns).
- **Bars on a month change (T027a):** when the user switches month, category bars and the spend-pace track grow from their old length to the new one over `--motion-slow`. Bars never animate on first render or when data refreshes on its own.
- **Hover lift (T027a):** a tile or widget the pointer rests on rises 1px and its Raised shadow deepens one step over `--motion-fast`, only under `@media (hover: hover)`. Nothing else moves on hover.
- **Live values (T027a):** a figure that changes while the user watches (a rate arriving, the weather refreshing, the spend-pace marker advancing) uses the arrival flip; a gauge marker slides to its new position over `--motion-base`. No count-up, no ticker, no looping animation in the content, apart from the skeleton pulse.
- **What never animates:** column width, row height, table layout, text size, sorting, scrolling, and any looping effect except the skeleton pulse and the background layer.
- **Tokens:** `--motion-fast` 120ms, `--motion-base` 200ms, `--motion-slow` 280ms (the FR-007 ceiling), `--motion-stagger` 40ms; `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`, `--ease-exit` `cubic-bezier(0.4, 0, 1, 1)`.
- **Reduced motion:** every duration and the stagger are 0ms, so the flip becomes an instant swap, items appear in their final places and the skeleton holds still; nothing is replaced by another effect.
- Informed by the Magic UI MCP's motion patterns (ideas only, no code or dependency): its flip and ticker patterns were weighed and cut down to a single whole-cell flip, because a per-character cascade on money reads as a value that is still settling.

### Background layer (ADR-0007)

The one exception to the 280ms ceiling and the no-loop rule. It is ambient, not a state change: slow enough that nobody tracks it, faint enough that no text loses contrast. The board (https://claude.ai/artifact/NHdkria1bTDsVYGyW1TXE8, version 4) is the reference rendering; these values are its values.

| Preset (`data-motion`) | What it draws | Movement | Light alpha | Dark alpha |
|---|---|---|---|---|
| None (`none`) | the still ground | none | — | — |
| Aurora drift (`aurora`) | three large blurred fields (80px blur): the tint, a fixed Platform blue and a fixed Lamp amber | each drifts and scales, 38s, 52s and 64s, `ease-in-out`, alternating | tint 0.55, companions 0.50 and 0.45 | tint 0.17, companions 0.15 and 0.13 |
| Board grid (`grid`) | a 48px line grid in the tint, masked to fade out from the top centre | translates one cell diagonally, 26s, `linear` | 0.06 (lines in Board Ink) | 0.14 |
| Particles (`particles`, default) | two tiles of small dots (190px and 120px repeats) in the tint | rise one tile height, 80s and 55s, `linear` | 0.28 | 0.32 |
| Grain (`grain`) | an SVG `feTurbulence` noise rect | steps its position, 0.9s, `steps(5)` | 0.12 | 0.16 |

The alphas are ceilings, not starting points: T008's composite test proves them and may only lower them. Lowered by T008's composite test on 2026-10-17. Aurora's companion fields are fixed hues, not a second user colour.

- **Technique:** one fixed layer, `@keyframes` on `transform` and `opacity` only, `will-change: transform` on the moving element. No script loop, canvas, WebGL or dependency.
- **Still frame:** each preset's 0 % keyframe. `animation-play-state: paused` under `:root[data-motion-paused]` (the user's pause, or `visibilityState === 'hidden'`); `animation: none` under `prefers-reduced-motion: reduce` and `prefers-reduced-data: reduce`. Both render the same frame, so two screenshots seconds apart match.
- **Never:** above content, under the pointer's control, scrolling with the page, printed (`@media print { display: none }`), or changing because data changed.
- **Signed out:** sign-in, sign-up, reset and the landing site show Particles in Signal mint (light) or the dark tint (dark), translucent, not paused, whatever a signed-in user chose.
- **Flag:** with `appearance.motion` off, `data-motion="none"`: the ground is still, panels stay translucent, saved choices are kept but not applied.

## Taste dials

From `Skill: design-taste-frontend` (design read: daily-use finance product UI for one person on phone and desktop, trust-first, native CSS tokens and Desk's own Vue blocks), cross-checked against the `ui-ux-pro-max` run recorded in `docs/design/SHORTLIST.md`, whose landing-page pattern and second accent were rejected.

- **Variance: 3.** A fixed-column board is symmetric by nature; the only exception is the double-width departure tile.
- **Motion intensity: 6** (5 from T027a, raised by ADR-0007, 2026-10-16). The signature flip, a one-time settle-in, list and sheet travel, bar growth on a month change, a 1px hover lift, and one slow, faint, user-chosen background layer; content never loops or scrolls into view.
- **Visual density: 5.** Board rows are denser than cards but stay readable at 360: three columns, 44px rows on the phone, 32px compact rows at desktop.

## Mock-ups

Coded mock-ups on the dev-only catalogue route (built in T027; preview deployments with `VITE_UI_CATALOGUE=true`):

- Month view: `/__ui/mockups/month-view` (also `?state=loading|empty|error` and `?fixture=edge`)
- Add expense: `/__ui/mockups/add-expense`
- Settings: `/__ui/mockups/settings`
- Today: `/__ui/mockups/today` (calendar and inbox panels plus the widget strip; T027a)
- Widgets: `/__ui/mockups/widgets` (every widget in its default, loading, empty, error and stale states, plus the add-widget and widget-settings sheets; T027a)
- Every Concourse Board mock-up is interactive over fixtures (switch month, add or remove an expense or widget, reorder, open sheets, switch theme) and plays simulated live data unless `?live=off`; the visual baselines load with `?live=off`.
- "Before" screenshots of the shipped screens: `docs/design/before/*.png` (T027)

## Fallback

If ADR-0007 is rejected, the Concourse Board stays exactly as accepted under ADR-0006 on 2026-10-10: this file as it stood at commit `5c3fa11`, opaque flaps with 2/4/8px corners, two shadow heights and no looping effect except the skeleton pulse. Every ADR-0007 row in ## Decisions reverts. Spec 006's account switches and picker are then not built; no second direction round is needed.

The earlier fallback, "The Ledger Desk" (the 2026-10-05 capture, IBM Plex and Ledger Green), was not taken when ADR-0006 was accepted; its values are in ADR-0006 and in this file's history before `5c3fa11`.

## Building a new panel

A panel is a titled region that loads, may be empty, may fail, and otherwise shows figures. Build it only from the blocks listed in `specs/004-web-ui-refresh/contracts/blocks.md`; every block is shown, in each theme, variant and state, at `/__ui` (run the web app with `VITE_UI_CATALOGUE=true`, then open `/__ui`). Each catalogue entry has a purpose line and a copy-ready `usage` snippet.

1. Make the panel one `<section role="region">` labelled by its own heading (`aria-labelledby`), with the heading level one below the screen's `h1`. `PanelFrame` is the same region with a `heading` and exactly one state body (`kind` loading, empty or error); it has no slot for loaded content, so a panel that shows data renders its figures itself, inside the region it owns.
2. Fill the three states, never a blank panel. Loading is `Skeleton` in the shape of the content (`text`, `tile`, `row` or `chart`). Empty is `EmptyState` with exactly one action in its `action` slot. Error is `PanelFrame kind="error"` (or `ErrorState`) with its `code`; wording that differs from the built-in copy is kept in a `causeMessages` record in the screen file keyed by error code and passed as `title` and `description`. Never one generic string, and the last good content stays visible when a refresh fails.
3. Put every figure in `Tile` or `DataTable` so it gets the figure face, tabular numerals, fixed columns and the arrival flip. Say status with a row lamp and a word, never colour alone.
4. Keep the screen file to layout: spacing tokens, grid or flex, `gap`, `max-width`. No colour, type or motion rule belongs there; the drift scan fails the build if one appears.
5. If no block fits, add a new block rather than styling in the screen: a component, plus a `.story.ts` beside it with `title`, `purpose`, `variants`, `states` and a `usage` snippet that contains `<Block`. The inventory test in `packages/ui/src/tokens.test.ts` requires all of them and the block's row in contracts/blocks.md.
6. Check: `pnpm --filter @desk/ui test` (inventory and drift scan), `pnpm --filter @desk/web test`, `pnpm typecheck`, add a unit test beside the panel that mounts it in jsdom for each state and snapshots the markup (see `Tile.test.ts`), then look at the panel at 360 and 1280 wide in both themes. The visual and axe runs happen in CI's e2e job; add a `SCREENS` entry in `tests/e2e/tests/visual.spec.ts` for a new screen.

Timing: agent run (not SC-006): built a panel from this section alone in 3 minutes, 1 attempt to green after the failing test, 2026-10-10. The timed run with a person other than the agent is SC-006 and is pending.
