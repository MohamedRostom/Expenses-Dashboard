# Design tools run (spec 006, T031)

Run 2026-10-18 on `phase-5/006-premium-motion` (HEAD 20471ab plus the uncommitted fixes below). Root `DESIGN.md`, the spec and `design-gaps.md` won over any tool advice; no token value was changed.

## What ran

- `Skill: redesign-existing-projects` (audit), `Skill: impeccable`, `Skill: design-taste-frontend`, read against the direction board. Most of their marketing-page rules (hero stack, eyebrow count, serif ban, 3-card rows) do not apply to an Operate-mode dashboard and were not used to override the board.
- `npx -y impeccable@4.1.0 detect <source files>`: `apps/web/src/components/appearance`, `packages/ui/src/components/{BackgroundMotion,Tile,PanelFrame,DataTable}.vue`, `packages/ui/src/charts/CategoryBars.vue`, `packages/ui/src/{surface,layout}.css`, `apps/web/src/views/{MonthView,SettingsView}.vue`.
- `npx -y impeccable@4.1.0 detect --viewport 360x800|1280x800 http://localhost:5173/login` (sign-in) and `http://localhost:5174/` (landing).
- Signed-in `/` and `/settings`: the detector's URL mode cannot carry the session cookie, and a cookie-injecting local proxy was refused by the permission system, so it was not used. Instead the authenticated pages (motion flag on, seeded data) were saved as rendered HTML (scripts removed, `<base>` set) and scanned with `detect <file>`. That is static HTML/CSS analysis, so it is width-independent and has no pixel-contrast check; contrast on those routes rests on the axe e2e specs and the arithmetic below.
- T049: `detect --viewport 360x800|1280x800 http://localhost:5173/__ui/mockups/month-view` and `/__ui/mockups/settings` (the signed-out catalogue mock-ups, the rendered stand-in for signed-in `/` and `/settings`): 1 primary finding per run, `cramped-padding` on `mk-theme` (the mock-up header's theme toggle, catalogue-only chrome that production does not ship; `BoardHeader.vue`, outside this task's files, left as is), plus the advisory `codex-grid-background`. Real signed-in routes are still **not** scanned at rendered width (see Open).
- The `impeccable-finish-reviewer` agent is not run here; the main session runs it.

## Findings and dispositions

Primary (counted) findings: source files 0, `/login` at 360 and 1280: 0, signed-in `/` and `/settings`: 0. Landing page: 8 `low-contrast` at both widths, all justified below.

| Finding | Where | Disposition |
|---|---|---|
| `low-contrast` (8) "pixel contrast ... on backdrop filter" | landing hero, steps, screenshots panels | Detector artifact, now **measured** (T049) instead of resting on axe: axe marks `backdrop-filter` nodes incomplete (0 on the shipped flag-off landing; 12 `color-contrast` nodes incomplete, 0 violations, on the motion-on build), so it proves nothing here. Method: motion-on landing build (`VITE_APPEARANCE_MOTION=true`), Aurora and Particles, light and dark, 360 and 1280; 14 frames of Aurora with its three animations set to different phases (covers its brightest tint); per flagged node the backdrop is the page with all glyphs made transparent, and the worst pixel under the node's box is compared with the node's computed colour. Result below; all 8 nodes pass 4.5:1 in every combination, so no glass or panel opacity token was raised. |
| `codex-grid-background` (advisory) | BackgroundMotion Board grid preset; `/login`, `/`, `/settings` when it is chosen | Justified: Board grid is one of the five agreed presets (ADR-0007, FR-001), opt-in behind `appearance.motion`; the grid is the background layer's identity, not surface decoration. |
| `repeating-stripes-gradient` (advisory) | month and settings pages | Justified: the Grain / motion layer texture from the direction board, behind the flag. |
| `gpt-thin-border-wide-shadow` (advisory) | glass panels, landing, `/login` | Justified: 1px glass line plus raised shadow are the board's approved glass values (design-gaps 2026-10-17); changing them is out of scope. |
| `design-system-radius` 999px (advisory) | `CategoryBars.vue` | Fixed (T049): the 8px-high track now uses `var(--radius-xl)` (16px), which clamps to the same fully rounded ends. |
| `design-system-font-size` x3 (advisory) | `YearBars.vue` | Out of spec-006 scope (chart labels, not a 006 surface). Not changed. |
| Settings lost its sticky section index (known item a) | `SettingsView.vue` | Fixed. Commit 2f1d409 (US2 reflow) deleted the `min-width: 1024px` block by accident while putting the sections on `.board-grid`; nothing in the spec asks for losing it. Restored: from 1024 a 12rem sticky column beside the panel grid (`grid-area` index and sections), below 1024 the scrolling row. |
| PanelFrame label ~4-6px off the table text (known item b) | `PanelFrame.vue`, `DataTable.vue` | Reworked (T049). The T031 fix (`:has(.desk-data-table)` label padding) also matched nested tables (Categories' Table tab) and staggered Settings labels by 4px, so it is gone. As on the board: from 768 a table that is the panel's direct child is inset by `--space-4` with its first cell flush, so label, row rule and first-cell text share the 16px inset; at 360 tables run edge to edge. Reflow e2e covers Entries label vs first cell, Categories (Table tab) vs Entries labels, and all Settings labels. |

## What changed

- `apps/web/src/views/SettingsView.vue`: sticky index media block restored.
- `packages/ui/src/components/PanelFrame.vue`, `packages/ui/src/components/DataTable.vue`: label/table inline alignment.
- `tests/e2e/tests/reflow.spec.ts`: two tests added first and seen red for the right reason (index `static` at 1280; label 4px off the first cell at 360), green after the fixes.
- Visual baselines regenerated only where the render changed (see the task report); landing screenshots only if the month view changed.

## Measured contrast, landing (T049)

Minimum over 14 frames and every pixel under the node, computed glyph colour against the glyph-free render. Normal text needs 4.5:1.

| Preset | Scheme | Width | Headings (`--color-fg`) | Muted lines (`--color-fg-muted`) |
|---|---|---|---|---|
| Aurora | light | 360 | 15.92 | 6.91 |
| Aurora | light | 1280 | 15.84 | 6.87 |
| Aurora | dark | 360 | 12.94 | 6.54 |
| Aurora | dark | 1280 | 12.17 | 6.65 |
| Particles | light | 360 | 16.90 | 7.34 |
| Particles | light | 1280 | 16.90 | 7.34 |
| Particles | dark | 360 | 16.01 | 7.94 |
| Particles | dark | 1280 | 16.01 | 7.93 |

Lowest of all 64 node/preset/scheme/width cells: 6.54:1 (Aurora, dark, 360, the "Desk converts it..." line). The earlier "6.5:1" nominal figure was right; the detector's 1.2:1 to 4.0:1 readings are glyph anti-aliasing, not the backdrop.

## Open

- Signed-in `/` and `/settings` have still not been scanned by the detector at a rendered width (it cannot carry the session cookie; the catalogue mock-ups above stand in for them). Needs a session-aware run, for example the detector against a Playwright-authenticated page, by the owner or a later task.
- Axe reports 12 `color-contrast` nodes as incomplete on the motion-on landing; the measurement above is what closes them, but a human look at Aurora's brightest frame is still `needs-rostom` (T035).
