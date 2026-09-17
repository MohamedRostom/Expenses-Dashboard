# Research: Web UI Refresh

Phase 0 of [plan.md](plan.md). Resolves every unknown in the plan's Technical Context and records
what each of the six tools the owner named actually is, how it is installed, and what it
contributes. No item remains NEEDS CLARIFICATION.

## R1. The direction document is a `DESIGN.md`

- **Decision**: the design direction (spec US1, FR-001–FR-004) is written as
  `docs/design/DESIGN.md` in the DESIGN.md convention popularised by the awesome-design-md
  collection: a plain markdown file listing character, colour roles, type scale, spacing,
  radii, motion rules and component conventions, that an AI coding agent reads before
  generating UI. It carries the kept/adjusted/replaced table (FR-002) and the fallback variant
  (refinement inside the current system). A new identity is proposed in
  `docs/adr/ADR-0006-visual-identity.md` and applied only once accepted.
- **Rationale**: one file the owner reviews, the agent reads on every UI task, and CLAUDE.md
  points at; the same format the reference systems arrive in, so comparison is line by line.
- **Alternatives considered**: a Figma or canvas file (no versioning next to the code, the
  owner has no designer); a wiki page (drifts from the repo).

## R2. Reference systems: shortlist from awesome-design-md, at most three

- **Decision**: the shortlist is produced in US1 with the tools installed, but the research
  pass already narrows it for a daily-use finance tool on a phone. Preliminary recommendation
  from the 73 DESIGN.md files in the collection: **Linear** (density, restrained type scale,
  first-class dark theme, motion that stays out of the way) as the primary reference,
  **Stripe** (numeric clarity, form and table conventions, calm status colour) for the money
  surfaces, and optionally **Vercel** (monochrome hierarchy with one accent) as a tie-breaker
  for the landing page. Only their principles and scales are borrowed; the chosen DESIGN.md
  files are copied into `docs/design/references/` with the collection's MIT notice, and no
  brand asset, logo, illustration or icon is reused (spec edge case on licences).
- **Rationale**: all three are productivity or finance products used daily on small screens,
  all have a mature dark theme, and none depends on illustration or brand colour to work, so
  their scales transfer to Desk's green accent or to a new identity equally.
- **Alternatives considered**: Notion (too document-centric), Shopify Polaris (a full
  component library, too heavy to borrow from), consumer banking apps (not in the collection;
  proprietary).

## R3. Tokens: CSS custom properties in `packages/ui/src/tokens.css`, one source

- **Decision**: extend the existing `tokens.css` (fonts, five colours, three theme states)
  with a type scale (`--text-xs … --text-2xl` with line heights), a spacing scale (`--space-1
  … --space-12` on a 4 px base), radii, elevation, colour roles (`--color-surface`,
  `--color-surface-raised`, `--color-border`, `--color-fg-muted`, `--color-accent-fg`,
  `--color-focus`, plus the existing warn and critical) and motion tokens (`--motion-fast:
  120ms`, `--motion-base: 200ms`, `--motion-slow: 280ms`, `--ease-standard`, `--ease-exit`).
  The three theme states stay exactly as they are. No JSON token file and no build step: the
  CSS file is the single source (FR-013).
- **Rationale**: the app already consumes `tokens.css`; custom properties are readable by the
  landing page, the catalogue and the snapshot tests without tooling (Principle VI).
- **Alternatives considered**: a `tokens.json` compiled to CSS (a build step for one file);
  Tailwind (a new dependency and a second vocabulary next to the tokens).

## R4. Token drift is caught by a test, not a linter

- **Decision**: `packages/ui/src/tokens.test.ts` (Vitest) scans `apps/web/src`,
  `apps/landing/src` and `packages/ui/src/components` for raw hex or rgb colours, `px` font
  sizes, and `px` margins, paddings or gaps that are not `var(--…)` references, with an
  allow-list for `0`, `1px` borders and `100%`. It fails naming the file and line (SC-007).
- **Rationale**: no new dependency (Stylelint would be one); the check is one regex per rule
  and runs in `pnpm test:unit`.
- **Alternatives considered**: Stylelint with a custom-property rule (new dependency,
  configuration); code review only (does not scale to later features).

## R5. Block catalogue and coded mock-ups live on one dev-only route

- **Decision**: `apps/web/src/catalogue/` holds `CatalogueView.vue` (index of every block with
  variants and states, both themes side by side) and `mockups/MonthViewMock.vue`,
  `AddExpenseMock.vue`, `SettingsMock.vue` (the "after" mock-ups from FR-004, built from the
  new blocks over fixture data). They are mounted at `/__ui` only when
  `import.meta.env.VITE_UI_CATALOGUE === 'true'`, which the dev server and preview
  deployments set and production does not, so the route and its chunk are absent from the
  production bundle. The page uses fixtures only and never calls the API (Principle IV).
- **Rationale**: Storybook is a large dependency (Principle VI); a route inside the app uses
  the real tokens, components, router and themes, and the preview URL the owner already
  visits for every PR.
- **Alternatives considered**: Storybook or Histoire (dependency, second build); a separate
  `apps/catalogue` workspace (duplicate Vite config for one page).

## R6. Visual snapshots with Playwright `toHaveScreenshot`, baselines from CI

- **Decision**: `tests/e2e/tests/visual.spec.ts` (project `ci`) screenshots every catalogue
  block and mock-up and every refreshed screen at 360 × 800 and 1280 × 800 in light and dark,
  Chromium only, with `maxDiffPixelRatio: 0.002` and animations disabled. Baselines are
  rendered inside the CI container and committed from the artifact of a `workflow_dispatch`
  job `update-snapshots` (the owner's machine has no Docker and Windows font rendering
  differs), never generated locally.
- **Rationale**: Playwright is already installed; one renderer keeps the matrix small; CI-only
  baselines remove the OS font problem at the source.
- **Alternatives considered**: a hosted visual-diff service (cost, an owner decision);
  WebKit in the snapshot matrix (doubles baselines for little signal; WebKit stays in the
  functional projects).

## R7. Motion: CSS transitions and Vue `<Transition>`, reduce-motion honoured globally

- **Decision**: state changes animate with CSS transitions driven by the motion tokens and
  Vue's built-in `<Transition>` and `<TransitionGroup>`; `tokens.css` sets every motion token
  to `0ms` inside `@media (prefers-reduced-motion: reduce)`, so FR-007 holds without
  per-component code. Nothing animates the layout of the expenses table; sheets, toasts, month
  switch and theme change animate opacity and transform only, under 300 ms.
- **Rationale**: no dependency; one media query satisfies FR-007 everywhere; transform and
  opacity keep the mobile performance budget.
- **Alternatives considered**: a motion library (dependency; Magic UI's components assume
  React and framer-motion).

## R8. Accessibility: axe in Playwright plus keyboard journeys, WCAG 2.2 AA

- **Decision**: every refreshed screen and every catalogue state runs `axeCheck` (existing
  fixture) in both themes at both widths; contrast pairs from the token file are asserted in
  `packages/ui/src/tokens.test.ts` (4.5:1 text, 3:1 large text, controls and focus ring);
  keyboard-only journeys for the five core flows live in `tests/e2e/tests/keyboard.spec.ts`;
  the focus ring is a single `--color-focus` outline of 2 px on every interactive block.
- **Rationale**: spec FR-009 and the clarified WCAG 2.2 AA threshold; the contrast test makes
  a token change fail before a screen does.
- **Alternatives considered**: manual audits only (not repeatable).

## R9. Screen-by-screen rollout, no runtime switch

- **Decision**: per the clarification, tokens and blocks land first (Slice A), then one screen
  per PR (Slice B), each with its snapshot, axe and keyboard checks and a preview URL; no flag,
  no second token set. Order: month view, add expense, categories, settings, auth screens,
  then whatever else exists at the time.
- **Rationale**: keeps every PR reviewable as a before/after; matches the constitution's
  finished-surface rule per screen.
- **Alternatives considered**: a `ui.refresh` flag with both looks (two token sets, double
  snapshots); one big-bang branch (unreviewable).

## R10. Landing page screenshots are generated, not hand-taken

- **Decision**: `tests/e2e/tests/screenshots.spec.ts` (run on demand and in the
  `update-snapshots` job) renders the refreshed month view and add-expense sheet over seeded
  data in both themes at phone width and writes `apps/landing/public/screenshots/*.png`; the
  landing page references those files (FR-014).
- **Rationale**: the screenshots cannot drift from the app; regeneration is one job.
- **Alternatives considered**: manual screenshots (drift); a live embedded app (no server on
  the static site).

## R11. The six tools: what they are and how each is used

| Step | Tool | What it is | Install / invoke | Use in this feature |
|------|------|------------|------------------|---------------------|
| 1 | impeccable (pbakaus/impeccable) | Design vocabulary and 23 commands for coding agents; makes the agent establish audience, use case and brand personality before UI code | `npx impeccable install` in the repo root, then `/impeccable init`; also available as a Claude Code plugin marketplace entry | Critique the current screens, draft the DESIGN.md sections, run its audit commands on each refreshed screen |
| 2 | taste-skill (Leonxlnx) | MIT agent skill that tunes variance, motion intensity and density for frontend code; Vue supported | `npx skills add https://github.com/Leonxlnx/taste-skill` | Judge the candidate directions and the coded mock-ups; record the three dials in DESIGN.md |
| 3 | awesome-design-md (VoltAgent) | MIT collection of 73 DESIGN.md files extracted from public product sites | `git clone` into a scratch folder outside the repo; copy the chosen files to `docs/design/references/` | Source of the reference shortlist (R2); "suggest the best UI" is the US1 shortlist task |
| 4 | skillui (amaancoderx/npxskillui) | MIT CLI that extracts a site's tokens, typography, components and screenshots into a `.skill` folder by static analysis | `npm install -g skillui`, `skillui --url <site>` | Optional, study material only for one reference site; output stays outside the repo (licence edge case) |
| 5 | ui-ux-pro-max | Local skill already installed: styles, palettes, font pairings, UX guidelines per product type | `/ui-ux-pro-max:ui-ux-pro-max` | Run for "finance dashboard, mobile-first, Vue" when drafting palette and type-pairing options |
| 6 | Magic UI MCP | MCP server exposing Magic UI's React + Tailwind + framer-motion components | `claude mcp add magicui -- npx -y @magicuidesign/mcp@latest` (owner adds it) | Ideas for motion and micro-interactions only; nothing copied, since Desk is Vue with no motion dependency |

None of the tools is a runtime dependency. Steps 1, 2 and 6 change the owner's Claude Code
configuration and steps 3 and 4 create folders outside the repo, so they run as US1 tasks with
the owner present, not during planning.

## Owner decisions and prerequisites this plan depends on

| Item | Status | Needed by |
|------|--------|-----------|
| ADR-0006 visual identity (accept, or fall back to refinement) | Drafted in Slice A, owner approves | Slice B |
| ADR-0002 product name | Open | Slice D landing page publication only |
| Baseline Phases 1–2 screens (month view, add expense, categories, settings) | Per `docs/ROADMAP.md` | Slice B |
| Baseline Phase 4 `apps/landing` scaffold (baseline T106) | Per roadmap | Slice D |
| Magic UI MCP added to the owner's Claude config | Owner | Slice A, optional |
