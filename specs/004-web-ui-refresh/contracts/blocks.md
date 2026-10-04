# Block Contract: Web UI Refresh

The shared blocks in `packages/ui/src/components/`, the only source of these elements on any
screen (spec FR-012). Each block ships with every listed variant and state rendered in the
catalogue in both themes, an axe-clean story, and a usage example. Common rules first, then
the inventory.

## Common rules

- Props are typed; visual choice comes from `variant`, `size` and `density`, never from
  ad-hoc classes passed in.
- State props: `loading`, `empty`, `error` (`{ cause: string }`); a block with `error` keeps
  its last content visible under the message; copy branches on `cause` through a
  `causeMessages` map the block accepts, never a generic string.
- Focus: `:focus-visible` outline `2px solid var(--color-focus)` with `outline-offset: 2px`.
- Minimum interactive size `var(--target-min)` (44 px) on phone; desktop may use 32 px for
  dense rows only inside `DataTable` and `MenuButton`.
- Motion only on `opacity` and `transform`, durations from the motion tokens.
- ARIA: roles and names per the inventory; every icon-only control has an accessible name.
- Numbers render in `--font-mono` with `font-variant-numeric: tabular-nums`.

## Inventory

Origin as of 2026-10-04: **exists** = already in `packages/ui`, refreshed in place;
**promote** = exists in `apps/web`, moved into `packages/ui` and its callers switched in the
same change; **new** = written in Slice A.

| Block | Purpose | Variants | States | Keyboard / ARIA | Used by |
|-------|---------|----------|--------|-----------------|---------|
| `Button` (exists) | actions | `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md` | default, hover, active, disabled, `loading` (spinner, keeps width) | native button; `aria-busy` when loading | all screens |
| `Input` (exists) | text, number, amount | `text`, `amount` (currency adornment, tabular), `search` | default, focus, invalid (`aria-invalid`, message linked by `aria-describedby`), disabled | native input | add expense, settings, auth |
| `Select` (exists) | single choice | native-backed | default, invalid, disabled | native select | add expense, categories |
| `Dialog` (exists; the "sheet") | modal, bottom sheet on phone, side panel on desktop | `center`, `bottom`, `side` | open, closing, `loading` | `role="dialog"`, `aria-modal`, focus trap, Esc closes, focus returns | add expense, widget settings |
| `Toast` (exists) | transient confirmation with undo | `info`, `success`, `warn`, `critical` | visible, leaving | `role="status"` (or `alert` for critical), undo button focusable, 6 s dismiss paused on hover/focus | saves, deletes |
| `PanelFrame` (promote: `PanelState.vue` + `WidgetFrame.vue`) | titled panel with header actions | `default`, `compact` | `loading` (Skeleton), `empty` (EmptyState), `error` (ErrorState) | `role="region"` with `aria-labelledby` | month view, today, widgets |
| `Skeleton` (exists) | placeholder shapes | `text`, `tile`, `row`, `chart` | animating, static (reduce-motion) | `aria-hidden` | inside PanelFrame |
| `EmptyState` (exists) | explains an empty panel and offers the next action | `default`, `inline` | with/without action | heading level passed in | every panel |
| `ErrorState` (exists) | names the cause and offers retry | `default`, `inline` | with/without retry | `role="alert"` on first render only | every panel |
| `Tile` (promote: `ForecastTile.vue`) | one primary figure with label and trend | `default`, `critical` (over budget) | `loading`, ready | figure is the first text node | month view, widgets |
| `DataTable` (exists, moves from `charts/`) | aligned rows of entries | `default`, `dense` | `loading` rows, empty, with a caption | `<table>` with `<caption>`, sortable headers as buttons with `aria-sort` | entries, categories |
| `Tabs` (new) | switch between views | `underline` | selected, focus | `role="tablist"`, arrow-key navigation, `aria-selected` | month/year, settings sections |
| `MenuButton` (new) | icon button opening a small menu | `icon`, `label` | open, closed | `aria-haspopup="menu"`, `aria-expanded`, arrow keys, Esc | panel headers, widget frames |
| `ThemeToggle` (new; logic stays in `theme.ts`) | system / light / dark | segmented | selected | `role="radiogroup"` | settings |
| `Kbd` (new) | keyboard hint | inline | — | `<kbd>` | command palette, help |

The hand-written charts (`CategoryBars`, `TrendSparkline`, `YearBars`) stay in
`packages/ui/src/charts/`, keep their SVG implementation, and are restyled on the tokens; each
gets a story like a block.

## Catalogue story contract

Each block has `packages/ui/src/components/<Block>.story.ts` exporting
`{ title, variants: [{ name, props }], states: [{ name, props }] }`; `CatalogueView.vue`
renders variants × states in a light and a dark column and the visual test screenshots each
cell. A block without a story fails `packages/ui/src/tokens.test.ts` (inventory check).

## Screen composition contract

Screens (`apps/web/src/views/*.vue`) may only: place blocks in a layout using spacing tokens,
pass props and slots, and add layout-only CSS (`display`, `grid`, `flex`, `gap`, `max-width`
with tokens). Any colour, type or motion rule inside a screen file fails the drift test.
