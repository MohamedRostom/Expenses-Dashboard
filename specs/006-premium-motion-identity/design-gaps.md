# T041 — Design gaps: board vs build

Comparison method: **source values only**, not live screenshots. The compose stack was up
(`infra-web-1` on :5173) but registering a fresh user, seeding expenses, flipping
`appearance.motion` per-user and shooting 2 widths × 2 themes × 2 presets × 2 routes was judged
too costly for this pass (session was already flagged cost-critical mid-task); per the task's own
fallback this is a source-value diff instead. Board source: the `Main.dc.html` design-canvas,
`renderVals()`, defaults preset=particles, intensity=70% (k=0.7), dark=true, glass=true,
accent=#2c7452. Build source: `packages/ui/src/tokens.css`, `surface.css`,
`components/BackgroundMotion.vue`, `Tile.vue`; `apps/web/src/views/MonthView.vue`;
`apps/web/src/components/appearance/AppearanceSettings.vue`.

Most of the board matches the build closely — it was built from the same ADR-0007 tokens. The
real gaps are: the Settings swatches are a different shape/size than the board's picker, the
"Background motion" section sits in Settings only (never inline on the month view, which is
correct per spec, not a gap), and a few numeric glass/shadow constants drifted slightly from the
board's simplified copy.

## Panels / glass

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Light glass bg | `rgba(255,255,255,0.66)` | `rgb(246 247 247 / 0.72)` (`--color-surface-glass`) | keep, by spec — board hard-coded a simplified value; tokens.css is normative |
| Dark glass bg | `rgba(21,26,33,0.58)` | `rgb(23 27 32 / 0.62)` | keep, by spec — same as above |
| Blur/saturate | `blur(20px) saturate(140%)` | `blur(var(--blur-surface))` = `blur(20px)`, no `saturate()` | gap — `packages/ui/src/surface.css:8-9`; board adds `saturate(140%)`, build doesn't |
| Radius | 16px | `var(--radius-xl)` = 16px | match |
| Border | light `rgba(17,20,24,0.10)` / dark `rgba(233,237,242,0.11)` | `--color-glass-line`: light `rgb(20 23 27/0.1)`, dark `rgb(242 242 238/0.11)` | match |
| Shadow dark | `inset 0 1px 0 rgba(255,255,255,.04), 0 16px 40px rgba(0,0,0,.38)` | `--shadow-raised` dark: identical | match |
| Shadow light | `0 1px 2px rgba(17,20,24,.06), 0 16px 40px rgba(17,20,24,.08)` | `--shadow-raised` light: identical | match |
| Opaque fallback | not modelled (board only toggles the Translucent-panels button) | `data-panels="solid"`, `forced-colors`, `prefers-reduced-transparency`, `@supports not backdrop-filter` all fall back to `--color-surface-raised` | keep, by spec — build has more fallback paths than the simplified board |

## Background motion

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Aurora blob size/blur | 58%×72% ellipse, blur(80px) | `60vmax × 60vmax` circle, blur(80px) | minor gap — board uses an ellipse sized to viewport %, build a vmax circle; visually close, not identical. `BackgroundMotion.vue:53-58` if alignment wanted |
| Aurora durations | 38s / 52s / 64s | 38s / 52s / 64s | match |
| Aurora opacity (dark) | fixed mix `mc`+blue+amber at full 0.55/0.45/0.40 scaled by k=0.7 → ~0.39/0.32/0.28 | `--motion-alpha-aurora` 0.17, `-blue` 0.15, `-amber` 0.13 (dark) | gap — build's shipped alpha tokens are dimmer than the board's k=0.7 preview; board has no intensity slider in the real product (by spec — T a deliberate cut, see below) |
| Intensity slider (`k`) | yes, 20–100% range prop | not implemented — alphas are fixed tokens | keep, by spec — spec 006 ships one opt-in on/off + presets, no end-user intensity control |
| Grid cell | 48px, line `rgba(…,0.06*k)` light / `0.14*k` dark, mask radial ellipse 50%/25%→78% | 48px, `--motion-alpha-grid` 0.06 light / 0.14 dark (k baked to 1), mask `50% 0%, 20%→75%` | match (mask ellipse centre differs 25%↔0%, cosmetic) |
| Particles tiles | 190px / 120px repeat, dot radii 1.2px/0.9px (board uses `k`-scaled opacity) | 190px / 120px repeat, dot radii 1.5px/1px, `--motion-alpha-particles` 0.28 light / 0.32 dark | minor gap — dot radius 1.2/0.9 (board) vs 1.5/1.0 (build); cosmetic, `BackgroundMotion.vue:128-144` |
| Grain | feTurbulence baseFrequency 0.85, steps(5) 0.9s | baseFrequency 0.8, steps(5) 0.9s | match (0.85 vs 0.8, cosmetic) |
| Reduced motion / data / forced-colors / print | board: only a "Reduced motion" toggle button, no data/forced-colors/print handling | build: `prefers-reduced-motion`, `prefers-reduced-data`, `forced-colors`, `print` all pause/hide | keep, by spec — build covers more cases than the simplified board demo |
| Motion colour in dark mode | board ignores picker in dark, fixed `#7fd1a8` | build: `--motion-tint` custom property set per-user choice, only exposed when `!dark` per `showColour` logic ported into `AppearanceSettings.vue` | match (same rule, same code path) |

## Settings › Appearance (motion picker)

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Preset control | row of button "cards", name + hint stacked, pressed state = 2px accent border | `desk-appearance-preset` label+radio grid, `auto-fill, minmax(14rem,1fr)`, name/blurb text + a small `.motion-thumb` (64×40px) preview swatch, checked state = accent border + shadow | gap — board shows presets as big labelled cards with no visual thumbnail; build adds a 64×40 live-rule thumbnail (`motion-thumb[data-preset]`) the board doesn't have. Build is richer, not wrong — call out as intentional divergence, not a bug |
| Colour swatches | 6 fixed hex dots, **44px round buttons**, `border-radius:999px`, selected = 3px solid ink border + `0 0 0 2px accent` ring | `.desk-appearance-swatch`, a 44px-min-height **row** (`target-min`) containing a **24px square, 2px-radius** colour chip (`::before`, `--space-6` × `--space-6`, `--radius-sm`) + label text, selected = `border-color: accent` + inset ring | **gap** — board's swatches are large free-standing 44px circles; build's are small 24×24 square chips inside a text row. `apps/web/src/components/appearance/AppearanceSettings.vue:299-329` — if the board's look is wanted, swap the row-with-label pattern for bare 44px round `<button>` swatches like the board |
| Custom colour input | 44px round `<input type=color>` + "Custom" label | not found as a distinct control in the grepped markup (swatch grid covers the 6 presets; no bespoke `<input type="color">` swatch confirmed in this pass) | **needs follow-up** — re-check `AppearanceSettings.vue` for a custom-colour affordance; board has one, unclear if build does |
| Section placement | its own "Background motion" surface panel, inline in the demo page (not literally Settings) | lives in `apps/web/src/components/appearance/AppearanceSettings.vue`, under Settings › Appearance | match — board's caption says "Settings › Appearance · saved to your account", confirming intent |

## Header

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Surface | transparent, sits over the motion background | opaque raised (ADR-0007: "the header, dialogs, menus, sheets and toasts stay opaque") | keep, by spec — board's demo header is a simplified toggle bar, not the real opaque header |
| Content | brand "Desk" + month label + 3 debug toggle pills (Dark/Translucent/Reduced motion) | real header has nav/brand, no debug toggles (those are dev-only in the board) | keep, by spec — board's pills are design-canvas controls, not a UI spec |

## Tiles

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Grid | `repeat(auto-fit, minmax(220px,1fr))`, 4 tiles | `MonthView.vue`: 2-col grid (`repeat(2, minmax(0,1fr))`) at narrow widths, `repeat(5, minmax(0,1fr))` at wide (line 602) | gap — build uses a fixed 2/5-column breakpoint set, board uses `auto-fit minmax(220px,1fr)` fluid wrap; both land similarly at the board's one tested width (1280) but diverge at in-between widths |
| Hero figure size | 40px, `font-weight:600`, `letter-spacing:-0.02em` | `--text-display-fluid` = `clamp(2rem,…,2.5rem)` = 32–40px fluid, weight 600, `--tracking-tight` -0.02em | match at ≥1280px (40px); board hard-codes 40px with no fluid clamp, so gap only below ~1280px where build legitimately shrinks and board doesn't (board has no responsive breakpoint modelled) |
| Hero accent ring | `border-color:accent; box-shadow: <shadow>, 0 0 0 1px accent inset` | not found as a distinct "primary tile" accent treatment in the grepped `Tile.vue`/`MonthView.vue` — `.desk-tile-block--primary` changes gap/figure size only, no accent border/ring in `Tile.vue:47-163` | **gap** — board's hero tile has an accent-coloured border + inset ring; build's primary tile has no border/ring treatment at all. `packages/ui/src/components/Tile.vue` — add an accent border/ring to `.desk-tile-block--primary` if this is wanted |
| Secondary tile figure | 26px | `--text-lg` = 1.125rem = 18px | gap — board's non-hero tiles are noticeably larger (26px) than the build's (18px) |

## Categories

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Bar height | 8px | not verified in this pass (not read; DESIGN.md says charts are "a small hand-written SVG layer", categories bars likely elsewhere, e.g. a Categories view component not opened) | **needs follow-up** — locate the categories bar component and confirm 8px track height, accent fill, red-over-budget fill, "Over budget by" caption all match |
| Fill colour | accent normal, `t.red` (`#b00020`/`#ff6b6b`) when over | tokens match (`--color-critical` light `#b00020`, dark `#ff6b6b`) | match (token level only; component not confirmed) |

## Entries

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Table / card layout | `flex: 1 1 460px` table next to Categories `flex: 1 1 380px` | not verified this pass — `MonthView.vue` Entries section not opened in detail | **needs follow-up** |

## Buttons

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Min height | 44px (`.dk-btn{min-height:44px}`) | `--target-min: 44px` used across interactive controls (`Tile.vue` action links, `AppearanceSettings.vue` swatches) | match |
| Focus ring | `2px solid #3b82f6` | `--color-focus` light `#4d80da` / dark `#a6caff`, `outline:2px solid var(--color-focus)` | gap — board's demo focus colour (`#3b82f6`, a generic blue) isn't the product's `--color-focus` token; cosmetic, board artifact only, not a build bug |

## Layout / reflow

| Item | Board | Build | Fix (file) |
|---|---|---|---|
| Max width / gutters | `max-width:1160px; padding:28px 24px 48px` | `MonthView.vue` padding `var(--space-4) var(--gutter-fluid) var(--space-12)`; `--content-max: 72rem` = 1152px | match (1152px vs 1160px, cosmetic) |

## Open follow-ups (not resolved from source alone)

1. Confirm whether `AppearanceSettings.vue` has a bespoke "Custom" colour `<input type="color">` matching the board's 44px round custom swatch — not found in the greps run this pass.
2. Confirm the Categories bar component's exact height/radius/over-budget caption text against the board (component file not located/opened this pass).
3. Confirm the Entries table/row styling (`rowStyle`, `dk-fig` tabular-nums date/amount cells) against whatever renders Entries in `MonthView.vue` (not opened this pass).
4. No screenshots were taken (see method note above); a follow-up pass with a signed-up test user and `pnpm flags set appearance.motion on --user <email>` can shoot `/` and `/settings` at 360/1280, light/dark, particles/aurora to confirm the above visually.

## Decisions (main session, 2026-10-17)

Rostom's rule is that the board is the target, so the "keep, by spec" verdicts above on glass opacity and motion strength are overruled. Open follow-ups 1–3 are resolved: the custom colour input exists (`AppearanceSettings.vue:187`); Categories already sit beside Entries, but second and at 1fr; the tiles are Left, Spent, Budget, Forecast.

| Area | Decision | Task |
|---|---|---|
| Glass | Board values: light `rgb(255 255 255 / 0.66)`, dark `rgb(21 26 33 / 0.58)`, `blur(20px) saturate(140%)`. Opaque fallbacks unchanged. | T043 |
| Motion strength | Board effective values at 70 %: Aurora light 0.49/0.35/0.32, dark 0.39/0.32/0.28 with deep companions `rgb(52 78 170)` and `rgb(140 96 30)` in dark; Particles light 0.63, dark 0.53 (second tile at 0.6 of that); Grid light 0.042, dark 0.098; Grain light 0.118, dark 0.157. If the contrast matrix fails, raise that one panel opacity, never dim the motion. | T042 |
| Motion geometry | Port the board exactly: Aurora blobs 58 % × 72 % ellipses at the board's positions; dot radii 1.2/1.8 and 0.9/1.5 px (tile A), 1/1.6 px (tile B); grid mask `ellipse at 50% 25%, #000 25%, transparent 78%`; grain `baseFrequency 0.85`, `numOctaves 3`. | T042 |
| Grounds | Keep the token grounds (`#e8eaeb` / `#0e1114`): within 3 of the board's and shared by every screen. | keep |
| Tiles | `auto-fit, minmax(220px, 1fr)`; the primary tile gets the accent border and a 1 px inset accent ring; secondary figures 26 px (1.625rem), hero 40 px. The tile content stays (Left, Spent, Budget, Forecast): the board's Fixed costs and Daily pace exist as spec 003 widgets behind their flags. | T044 |
| Categories and Entries | Categories first (`flex: 1 1 380px`), Entries second (`flex: 1 1 460px`), wrapping to one column on a phone; category track 8 px, round, accent fill, red when over, "Over budget by £x" line. | T044 |
| Settings swatches | Bare 44 px round buttons (accessible name from `aria-label`), selected: 3 px ink border plus a 2 px accent ring; custom colour a 44 px round input with a "Custom" label. | T045 |
| Preset cards | Name and hint stacked, selected = 2 px accent border. The still thumbnail stays, by the clarification on thumbnails. | T045 |
| Header pills, focus blue | Board demo controls only; keep the product header and `--color-focus`. | keep |

Screenshots are taken by the stage review after T042–T045, with the flag on for a test user.
