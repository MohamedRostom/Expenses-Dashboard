# Data Model: Web UI Refresh

No database change. The "entities" of this feature are static artefacts that other code reads:
the direction document, the token file, the block inventory and the snapshot matrix. Their
shapes are fixed here so tasks, tests and the catalogue agree.

## Design direction (`DESIGN.md`)

The file lives at the repository root and follows the DESIGN.md format that impeccable and its
detector read (decided 2026-10-05). It opens with YAML frontmatter, whose only top-level keys are
`name`, `description`, `colors`, `typography`, `rounded`, `spacing` and `components`. The
frontmatter is normative, and every colour in it equals a value in `packages/ui/src/tokens.css`
(or in `proposed-tokens.css` while the state is Proposed). The eight canonical sections follow,
with these exact headings and in this order, because the tooling parses the headings:

1. `## Overview`: the Creative North Star and the **character** (three or four words, plus one
   paragraph on why they fit a daily-use finance tool on a phone), the key characteristics, and
   a `State:` line.
2. `## Colors`, 3. `## Typography`, 4. `## Layout`, 5. `## Elevation & Depth` and
   6. `## Shapes`: together these are the **scales**, meaning the token values from
   contracts/tokens.md in light and dark, with named rules.
7. `## Components`: the **block conventions**, covering naming, prop shape, state props
   (`loading`, `empty`, `error` with `cause`), the focus ring, minimum target size and the
   density dial, plus one entry per block.
8. `## Do's and Don'ts`.

Then come the spec 004 sections, in this order, each mandatory:

9. `## References`: at most three, each with its source
   (`docs/design/references/<name>.DESIGN.md`), its licence (the MIT notice from
   awesome-design-md; no brand asset is copied) and one line per thing borrowed.
10. `## Decisions`: one row per existing decision from CLAUDE.md "Design system" (IBM Plex
    Sans/Mono, accent `#1f6e5a`/`#5fbf9f`, backgrounds `#f2f4f7`/`#121820`, warn `#a8641a`
    (already adjusted to `#8f5810` in light for AA), critical `#a83a2e`, three theme states,
    hand-written SVG charts, status colours never used as chart series). It also has one row
    per decision taken in the 2026-10-05 capture: lifted surfaces with two elevations, the focus
    ring in its own blue, and the Ledger Desk character. Each row is valued
    `kept | adjusted (new value, reason) | replaced (ADR-0006)`.
11. `## Motion`: what animates (opacity, transform) and what never does (table layout, text
    size), the duration of each token, easing, and reduce-motion behaviour.
12. `## Taste dials`: variance, motion intensity and visual density as recorded from the taste
    skill, each with the chosen value and one sentence of reasoning.
13. `## Mock-ups`: links to `/__ui/mockups/month-view`, `/__ui/mockups/add-expense`,
    `/__ui/mockups/settings`, `/__ui/mockups/month-view-fallback` and the "before" screenshots.
14. `## Fallback`: the refinement variant, used if ADR-0006 is rejected. Every decision is
    `kept`, and the incumbent capture's named rules apply unchanged; only scales, motion,
    states and consistency change.
15. `## Building a new panel`: the thirty-minute walkthrough (User Story 3).

Whenever DESIGN.md is regenerated, `.impeccable/design.json` (the impeccable sidecar holding
shadows, motion, tonal ramps and component snippets) is regenerated in the same change.

State: `Captured (incumbent, 2026-10-05) → Draft → Proposed (ADR-0006 open) → Approved |
Approved-fallback`. Slice B starts only in one of the two approved states.

## Tokens (`packages/ui/src/tokens.css`)

Custom properties on `:root`, overridden for dark in the two existing guarded blocks and for
reduce-motion in one media query. Groups and counts (exact names in contracts/tokens.md):

| Group | Tokens | Rule |
|-------|--------|------|
| Font | `--font-sans`, `--font-mono` | kept unless ADR-0006 replaces |
| Type scale | 7 sizes with paired line heights | modular, base 16 px, no size outside the scale |
| Spacing | 12 steps on a 4 px base | every margin, padding and gap uses a step |
| Radius | 3 | small controls, panels, sheets |
| Elevation | 2 | raised surface and overlay; shadow values differ per theme |
| Colour roles | 12 | bg, surface, surface-raised, border, fg, fg-muted, accent, accent-fg, focus, warn, critical, selection |
| Motion | 3 durations + 2 easings | all durations `0ms` under reduce-motion |

Invariants tested in `packages/ui/src/tokens.test.ts`: every colour-role pair listed in
contracts/tokens.md meets its WCAG 2.2 AA ratio in both themes; every token defined in light
has a dark value or is explicitly theme-independent; no source file outside `tokens.css` holds
a raw colour, `px` font size or `px` spacing (allow-list: `0`, `1px` borders, `100%`,
`transparent`, `currentColor`).

## Blocks (`packages/ui/src/components/`)

One entry per block in contracts/blocks.md with: name, purpose, props, variants, states,
keyboard behaviour, ARIA role, minimum size, and which screens use it. Every block has a
catalogue story showing each variant × state in both themes. Blocks never import from
`apps/*`; screens never restyle a block beyond layout placement.

## Catalogue fixtures (`apps/web/src/catalogue/fixtures.ts`)

Synthetic only: one user (`default_currency: 'GBP'`, `time_zone: 'Europe/London'`,
`theme: 'system'`), one month of about thirty expenses across the default categories including
one long category name (48 characters), one six-digit amount, one day with thirty entries,
three budgets (one over), and the error causes the panels can show. No real data ever.

## Snapshot matrix (`tests/e2e/tests/visual.spec.ts`)

| Dimension | Values |
|-----------|--------|
| Subject | every catalogue story; the four mock-ups; every refreshed screen (18 routes, Today panels and widgets with their flags on); the existing `year.spec.ts` shots |
| Width × height | 360 × 800, 1280 × 800 |
| Theme | light (`data-theme="light"`), dark (`data-theme="dark"`) |
| Renderer | Chromium in `mcr.microsoft.com/playwright:v<pinned>-noble` (research R6) |
| Tolerance | `maxDiffPixelRatio: 0.005` set once in config, animations disabled, clock frozen, fonts self-hosted; no per-call override |

Baseline files live next to each spec (`*.spec.ts-snapshots/`) and are produced only in the
pinned image, by the `update-snapshots` workflow or a local Docker run; a snapshot change in a
PR must be an intended one named in the PR description. About 150 images in total.

## Drift pending list (`packages/ui/src/drift-pending.json`)

A sorted JSON array of repo-relative paths, e.g. `["apps/web/src/views/BinView.vue"]`.
Seeded in Slice A from the first drift run; may only shrink; a listed file that is already
clean fails the test; deleted in Slice D when empty (research R12).

## Journey baseline (`tests/e2e/fixtures/journey-baseline.json`)

```json
{ "add-expense-foreign": { "taps": 4, "keystrokes": 9, "screens": 2 } }
```

Values illustrative. One key per core journey: `sign-in`, `add-expense-foreign`,
`change-month`, `edit-budget`, `open-settings`. Recorded on `main` in Slice A0 before any token
change; counts may only go down (research R13).

## Landing screenshots (`apps/landing/public/screenshots/`)

`month-light.png`, `month-dark.png`, `add-light.png`, `add-dark.png` at 360 wide, rendered by
`tests/e2e/tests/screenshots.spec.ts` over the same synthetic fixtures; regenerated by the
`update-snapshots` workflow and committed with the screen change that altered them.
