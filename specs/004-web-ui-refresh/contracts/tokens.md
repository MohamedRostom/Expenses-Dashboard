# Token Contract: Web UI Refresh

What every screen, block and the landing page may consume from `packages/ui/src/tokens.css`.
Names are fixed here; values are set by the approved `docs/design/DESIGN.md` (the current
values remain until then). `packages/ui/src/tokens.test.ts` asserts the invariants at the end.

## Names

```text
Font        --font-sans  --font-mono
Type        --text-xs  --text-sm  --text-md  --text-lg  --text-xl  --text-2xl  --text-display
            --leading-xs … --leading-display   (one line height per size)
            --tracking-tight  --tracking-normal
Spacing     --space-1 (4px) --space-2 (8px) --space-3 (12px) --space-4 (16px) --space-5 (20px)
            --space-6 (24px) --space-8 (32px) --space-10 (40px) --space-12 (48px)
            --space-16 (64px) --space-20 (80px) --space-24 (96px)
Radius      --radius-sm  --radius-md  --radius-lg
Elevation   --shadow-raised  --shadow-overlay
Colour      --color-bg  --color-surface  --color-surface-raised  --color-border
            --color-fg  --color-fg-muted  --color-accent  --color-accent-fg
            --color-focus  --color-warn  --color-critical  --color-selection
Motion      --motion-fast (120ms)  --motion-base (200ms)  --motion-slow (280ms)
            --ease-standard  --ease-exit
Layout      --target-min (44px)  --content-max (72rem)  --gutter (--space-4 at phone, --space-8 at desktop)
```

## Theme contract (unchanged from the baseline)

- Bare `:root` is light.
- `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` is system dark.
- `:root[data-theme="dark"] { … }` is explicit dark.
- Every colour token is redefined in both dark blocks; no colour gets its only definition in a
  media query; `body` always has an explicit background.
- Between the mock-ups and the ADR-0006 decision only, `:root[data-identity="proposed"]` (and
  its two dark counterparts) may override the colour, type and radius tokens; the attribute is
  set only by catalogue wrappers and the blocks are deleted at the decision (tasks T017, T019).

## Motion contract

- `@media (prefers-reduced-motion: reduce)` sets the three durations to `0ms`.
- Only `opacity` and `transform` animate; `height`, `width`, `font-size` and table layout never
  do.
- No transition exceeds `--motion-slow`.

## Contrast pairs asserted (WCAG 2.2 AA, both themes)

| Foreground | Background | Minimum |
|------------|------------|---------|
| `--color-fg` | `--color-bg`, `--color-surface`, `--color-surface-raised` | 4.5:1 |
| `--color-fg-muted` | `--color-bg`, `--color-surface` | 4.5:1 |
| `--color-accent-fg` | `--color-accent` | 4.5:1 |
| `--color-accent` | `--color-bg` | 3:1 (as a control or large text) |
| `--color-warn`, `--color-critical` | `--color-bg`, `--color-surface` | 4.5:1 as text |
| `--color-focus` | `--color-bg`, `--color-surface`, `--color-accent` | 3:1 |
| `--color-border` | `--color-bg` | 3:1 |

## Consumption rules (drift test)

Allowed in `apps/web/src`, `apps/landing/src`, `packages/ui/src/components`:
`var(--…)`, `0`, `1px` (borders only), `100%`, `auto`, `transparent`, `currentColor`,
`inherit`, `env(safe-area-inset-*)`, and `calc()` of the above.

Forbidden anywhere outside `tokens.css`: hex or `rgb()`/`hsl()` colours, `font-size` in `px`
or `rem` literals, `margin`/`padding`/`gap` in `px` or `rem` literals, `transition-duration`
literals. The test names the file and line of every hit.
