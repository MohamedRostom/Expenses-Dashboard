# Feature Specification: Web UI Refresh

**Feature Branch**: `004-web-ui-refresh` (spec directory; delivery branch to be named when the
feature is scheduled)

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "create a new spec for enhancing the webpage UI using the following
steps: 1. npx impeccable skills install 2. then add https://github.com/Leonxlnx/taste-skill.git
skills 3. then add https://github.com/VoltAgent/awesome-design-md.git then suggest the best UI to
be used 4. then use https://github.com/amaancoderx/npxskillui.git to clone a site if needed
5. use /ui-ux-pro-max:ui-ux-pro-max 6. magicuidesign mcp"

Desk's screens should look and feel like a finished, considered product rather than a working
prototype: a clear visual hierarchy on every page, consistent spacing and type, deliberate motion
on state changes, designed empty, loading and error states, and the same quality at phone width
as on a desktop. The refresh is guided by a written design direction chosen from a set of
reference design systems, so that every later screen is built to the same standard instead of
re-deciding its look each time. The six tool steps in the input are the owner's requested
research and authoring workflow for producing that direction and the screens; they are recorded
under *Design workflow requested by the owner* so the planning phase picks them up, and they do
not change what the user is promised here.

## Clarifications

### Session 2026-09-17

- Q: Which surfaces are in scope? → A: Both the signed-in app screens and the landing page; app
  first, landing page last.
- Q: How far may the design system change? → A: A new visual identity may be proposed, approved
  by the owner in a recorded decision (ADR-0006) before any screen changes.

### Session 2026-09-17 (pre-planning, answered by the agent at the owner's request)

- Q: How does the refresh reach users: one big switch, screen by screen, or behind a runtime
  switch with both looks available? → A: Screen by screen; the direction's tokens land first in
  one change, then each screen is refreshed in its own change reviewed on the preview
  deployment; no runtime switch and no second token set, because the product is not yet
  announced (the constitution's flag rule applies to features, not to the look).
- Q: What form do the direction's mock-ups take? → A: Coded static pages built with the new
  tokens and blocks, viewable on the preview deployment in both themes at phone and desktop
  width; they double as the first visual-snapshot baselines. Static images are acceptable only
  for the "before" side.
- Q: Which screens must exist before the app-screen story starts? → A: The month view, the
  add-expense flow, categories with budgets and settings (roadmap Phases 1–2); the refresh is
  scheduled at the start of Phase 4 as the roadmap already places it, and screens built later
  adopt the direction through the shared blocks. *(Timing superseded 2026-10-04: Phase 4 and
  specs 002–003 have shipped, so the refresh starts now and covers every screen; see below.)*
- Q: Which accessibility standard defines "the threshold"? → A: WCAG 2.2 Level AA throughout:
  text contrast 4.5:1 (3:1 for large text and for non-text controls), a visible focus indicator
  at least 2 px thick with 3:1 contrast against the unfocused state, and no motion that cannot
  be turned off. Tap targets stay at 44 px, stricter than the AA minimum of 24 px.
- Q: If the owner rejects the proposed new identity (ADR-0006), does the refresh stop? → A: No;
  it proceeds as a refinement inside the current design system (hierarchy, spacing, motion,
  states, consistency), which is the direction's mandatory fallback and is drafted alongside the
  proposal so the rejection costs one review round, not a restart.
- Q: May the proposed identity appear anywhere before ADR-0006 is accepted? → A: Only in the
  block catalogue and the coded mock-ups on dev and preview deployments; shipped screens keep
  the existing system until acceptance.
- Q: Does the fallback need mock-ups too? → A: One: the month view, in both themes at both
  widths; the other screens follow from the blocks.
- Q: Are the mock-up screens enough for the start gate and the five core flows? → A: Yes; the
  categories and sign-in screens are refreshed from the blocks without a mock-up.
- Q: Do 44 px tap targets apply on desktop? → A: 44 px on phone; on desktop interactive
  elements are at least 24 px, and dense table rows and menu items may use 32 px.
- Q: What are the desktop layout rules? → A: From 1024 px wide, content is centred within one
  maximum width, tiles sit in a single row, and the category bars and entries table sit side
  by side; nothing stretches beyond the maximum width.

### Session 2026-10-04 (answered by the agent at the owner's request)

- Q: Which screens are in scope now that Phase 4 and specs 002–003 have shipped (about 24
  views, plus flagged panels and widgets)? → A: Every signed-in screen. The five core-flow
  screens (month view, add expense, categories with budgets, settings, sign-in) and the Today
  view are refreshed one change each; every other screen (year and category views, import,
  bin, capture, onboarding, connections, register/verify/reset, and the spec 002–003 panels and
  widgets) is refreshed in changes grouped by area, from the blocks, without mock-ups. Flagged
  screens are refreshed behind their existing flags; no flag changes state.
- Q: How close must a screen be to its approved snapshot? → A: Snapshots are rendered only in
  the pinned browser container CI uses, with animations disabled and the clock frozen, and a
  screen matches when at most 0.5 % of its pixels differ; the rule applies to every visual
  snapshot in the suite, replacing the fixed pixel allowances already in it.
- Q: Do the checks that need real people (SC-002, the SC-003 screen-reader pass, SC-006,
  SC-008) block merging? → A: No; they are `needs-rostom`, recorded in `docs/ROADMAP.md`, and
  never block a screen change. SC-002 runs as part of the direction review (User Story 1); the
  screen-reader pass uses NVDA on Windows and VoiceOver on iPhone, once on the preview
  deployment after the last core screen is refreshed; the feature is not called done until all
  four results are recorded.
- Q: What is the "before" count for the zero-regression check? → A: Before the token change
  merges, each core journey in the automated suite records its taps, keystrokes and screens in
  a committed baseline file; every screen change asserts its journey counts are equal or lower.
- Q: Over what area is the 0.5 % snapshot tolerance measured? → A: Per image, and every image
  is one viewport (360 × 800 or 1280 × 800); content below the first viewport is captured as
  element snapshots of each panel, never as one full-page image.
- Q: What counts as a tap, a keystroke and a screen? → A: A tap is each pointer activation; a
  keystroke is each key press, each typed character included; a screen is each change of route.
  Opening a sheet or dialog is not a screen; the tap that opens it is counted.
- Q: Does FR-018 override the snapshot tolerances written in spec 001 (the year view, T100)? →
  A: Yes; those snapshots are re-baselined under FR-018, and spec 001's tasks stay unedited as
  a historical record.
- Q: What does "published" mean for the landing page? → A: Deployed to its public host through
  the `LANDING_ENABLED` repository variable, which only the owner sets once the product name is
  decided; local, CI and preview builds are not publication.
- Q: Which wins when a WCAG 2.2 AA fix needs an extra step that FR-010 forbids? → A:
  Accessibility, only when the step is unavoidable: the change raises that journey's baseline
  in the same change, gives the reason in its description, and the owner approves it in
  review; any other increase fails.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A written design direction to build against (Priority: P1)

The owner receives a short design direction document for Desk: the visual character (what the
product should feel like in three or four words), the reference design systems it draws on and
why, the type scale, spacing scale, colour roles, motion rules and component conventions, and
before/after mock-ups of the three most-used screens (month view, add expense, settings). The
document names what stays fixed from the existing design decisions and what is new, so a
reviewer can see the delta at a glance.

**Why this priority**: every other story depends on agreeing the direction first; without it the
refresh is a series of unrelated tweaks. It is also the only story that produces something the
owner can approve or reject before any screen changes.

**Independent Test**: the owner reads the document and the mock-ups in under fifteen minutes and
can answer, without asking, which reference systems were chosen, why, and what will change on the
month view; four of five people outside the project shown the before/after mock-ups pick the
"after" as the more finished product (SC-002).

**Acceptance Scenarios**:

1. **Given** the set of reference design systems, **When** the direction is drafted, **Then** it
   names at most three references, says what is taken from each, and states in one paragraph why
   they fit an expense tracker used daily on a phone.
2. **Given** the existing design decisions (type family, accent, backgrounds, status colours,
   three theme states), **When** the direction is written, **Then** each decision is listed as
   kept, adjusted (with the new value and the reason) or replaced, and a replacement is flagged
   as needing the owner's sign-off.
3. **Given** the three most-used screens, **When** the mock-ups are produced, **Then** each shows
   the phone and desktop layouts, both themes, and the loading, empty and error states.
4. **Given** the finished direction, **When** the owner reviews it, **Then** they can approve it
   as a whole or return it with named objections, and nothing in later stories starts until it
   is approved.

---

### User Story 2 - The app screens follow the direction (Priority: P1)

A user opening any screen of the app after the refresh sees the same visual language: one
type scale, one spacing rhythm, consistent controls, panels with clear titles and secondary
information de-emphasised, numbers aligned and easy to compare, and state changes (saving,
loading, switching month, opening a sheet) that animate briefly and predictably. Nothing they
could do before is harder or slower; the refresh changes appearance and feel, not workflow.

**Why this priority**: this is the visible outcome the request asks for; it is P1 alongside the
direction because the direction has no value until at least the main screens follow it.

**Independent Test**: on a phone and a laptop, a user completes the core flows (sign in, add an
expense in a foreign currency, change month, edit a category budget, open settings) and every
screen visited passes the accessibility audit, the visual snapshots match the approved mock-ups,
and each flow takes no more taps or keystrokes than before the refresh.

**Acceptance Scenarios**:

1. **Given** the month view, **When** it loads, **Then** the tiles, category bars and entries
   table follow the approved type and spacing scales, and the primary figure of each tile is the
   most prominent element on the screen.
2. **Given** any panel, **When** its data is loading, absent or failed, **Then** the panel shows
   the designed skeleton, empty or error state from the direction, and the error copy names the
   cause.
3. **Given** a state change (save, month switch, sheet open or close, theme change), **When** it
   happens, **Then** it is animated within the direction's motion rules, completes in under
   300 ms, and is disabled entirely when the user has asked their device to reduce motion.
4. **Given** a screen at 360 px wide, **When** it renders, **Then** every control is reachable,
   nothing scrolls sideways, tap targets are at least 44 px, and the layout is the one in the
   phone mock-up.
5. **Given** the light theme, the dark theme and the system theme, **When** the user switches
   between them, **Then** every colour role resolves to a value from the direction and text
   contrast meets WCAG 2.2 AA (4.5:1, 3:1 for large text) in both themes.
6. **Given** the refreshed screens, **When** the accessibility audit runs, **Then** no serious
   or critical issues are reported, and every interactive element is reachable by keyboard in a
   sensible order with a visible focus indicator.

---

### User Story 3 - Reusable building blocks (Priority: P2)

Someone building a later screen (a new panel, a widget, a settings section) assembles it from
the refreshed set of shared building blocks (buttons, inputs, selects, sheets, toasts, panel
frames, skeletons, empty and error states, tables, tiles) and gets the direction for free,
without copying styles or inventing new ones. Each block is documented with its variants, its
states and an example, in one place a contributor can browse.

**Why this priority**: it is what keeps the refresh from decaying as new features arrive; it can
follow the first two stories because the main screens can be refreshed first and their pieces
extracted afterwards.

**Independent Test**: a contributor builds a new panel with a title, a list, a loading state and
an empty state using only the documented blocks in under thirty minutes, and it passes the
visual and accessibility checks without further styling.

**Acceptance Scenarios**:

1. **Given** the block catalogue, **When** a contributor opens it, **Then** every block shows its
   variants and states in both themes with a usage example.
2. **Given** a new screen built only from the blocks, **When** the visual snapshots are compared
   with the approved direction, **Then** no spacing, type or colour value falls outside the
   direction's scales.
3. **Given** a change to a token (say the spacing scale), **When** it is made in the one place
   it lives, **Then** every screen reflects it and no screen holds a copied value.

---

### User Story 4 - The landing page shares the direction (Priority: P3)

A visitor arriving at the marketing page sees the same visual character as the app: the same
type, colours and tone, with screenshots that match what they will see after signing up, and a
clear three-step explanation of the product.

**Why this priority**: it is the first impression for strangers, but it depends on the app
screens being refreshed first (the screenshots must show the refreshed app) and on the product
name decision, which is still open.

**Independent Test**: three people outside the project open the landing page on their phones,
describe what the product does in one sentence, and find the sign-up action without help; the
screenshots on the page are visually identical to the corresponding refreshed app screens.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** it loads on a phone, **Then** the headline, the three
   steps and the sign-up action are visible without horizontal scrolling and the page passes the
   accessibility and performance budgets.
2. **Given** the refreshed app, **When** screenshots are placed on the landing page, **Then**
   they are taken from the refreshed screens in both themes and are regenerated by the snapshot
   workflow in the same change that alters those screens.

---

### Edge Cases

- A reference design system's licence forbids reuse of its assets: the direction may borrow
  principles (scales, rhythm, hierarchy) but no proprietary asset, icon or illustration is
  copied; the direction records the licence of each reference.
- A suggested reference or a cloned page conflicts with a fixed design decision (type family,
  accent colour, three theme states, hand-written charts, status colours never used as chart
  series): the fixed decision wins unless the owner changes it in a recorded decision; the
  direction lists every such conflict.
- Motion makes a screen feel slower on a low-end phone: motion durations are capped and every
  animation can be switched off by the device's reduce-motion preference; the performance
  budget is measured on the throttled mobile profile.
- A user with a very long category name, a six-digit amount, or thirty entries in a day: the
  refreshed layouts truncate, with the full value in the element's accessible name and a
  `title` tooltip; content never overflows the tile, and the table keeps its alignment.
- Dark theme on an OLED phone at night: no dark-theme surface or background is lighter than
  `--color-surface-raised`, and white is used only for text and icons; text contrast stays
  within the threshold without glare.
- A screen added by another feature after its area's refresh has merged is built from blocks
  and tokens from the start (User Story 3); it is never added in the old look.
- A screen sits behind a feature flag that is off in production (spec 002–003 panels and
  widgets): it is refreshed and snapshotted with the flag on in the test environment; the flag
  itself is not changed by the refresh.
- The refresh lands while a feature branch is mid-flight: because tokens land first and screens
  follow one at a time, an unmerged screen keeps rendering with the new tokens and is refreshed
  and re-snapshotted in its own change after merge. A half-refreshed product is expected while
  the refresh is in progress, and acceptable because nothing is announced yet. The app shell
  (header, navigation, feedback widget) is refreshed before any screen, so every screen shares
  one header throughout.
- A block is needed that the catalogue does not have: it is added to the catalogue with its
  states and documented before the screen that needs it ships; no one-off styling on a screen.
- The product name is still undecided when the landing page is due: the landing page is built
  and reviewed under the working name on local, CI and preview builds, and is not published
  (deployed to its public host through the `LANDING_ENABLED` repository variable, set only by
  the owner) until the name is chosen.
- An accessibility fix needs a step the old flow did not have: WCAG 2.2 AA wins when the step is
  unavoidable; the change raises that journey's baseline with the reason stated and the
  owner's approval in review (FR-010).

## Requirements *(mandatory)*

### Functional Requirements

Requirement IDs are stable and grouped by section, not sorted by number: FR-017 and FR-018 were
added later and keep their numbers so the task references stay valid.

Design direction

- **FR-001**: A written design direction MUST exist before any screen changes, naming at most
  three reference design systems, what is taken from each, their licences, and the visual
  character in three or four words.
- **FR-002**: The direction MUST list every existing design decision (type family, accent,
  backgrounds, status colours, three theme states, hand-written charts, status colours never
  reused as chart series) as kept, adjusted or replaced; any replacement MUST be recorded as a
  decision the owner approves separately before it is applied. The direction MUST also contain
  a fallback that keeps every existing decision and refines only hierarchy, spacing, motion,
  states and consistency, so a rejected replacement returns the refresh to that fallback
  without a second direction.
- **FR-003**: The direction MUST define one type scale, one spacing scale, colour roles for both
  themes, motion rules (durations, easing, what animates, what never does) and the conventions
  every shared block follows.
- **FR-004**: The direction MUST include before/after mock-ups of the month view, the add-expense
  flow and settings at phone and desktop widths in both themes, including loading, empty and
  error states. The "after" mock-ups MUST be coded static pages built from the new tokens and
  blocks, viewable on the preview deployment, and they become the first visual-snapshot
  baselines; the "before" side may be screenshots. The fallback variant MUST have one mock-up,
  the month view, in both themes at both widths. The categories and sign-in screens have no
  mock-up and are refreshed from the blocks.

App screens

- **FR-005**: Every screen the refresh touches MUST use only values from the direction's scales
  and colour roles, including the hand-written charts, which are restyled to the tokens. No
  screen may hold a copied or ad-hoc value. The only literals allowed are the ones in
  contracts/tokens.md §Consumption rules (`0`, `1px` borders, `100%`, `transparent`,
  `currentColor`), and the drift check enforces exactly that list.
- **FR-006**: Every panel MUST have a designed loading, empty and error state, plus an offline
  state where the panel's own spec defines one (the spec 003 widgets). Error copy MUST name the
  cause and never be one generic banner. A panel's causes are the ones its owning spec (001–003)
  defines, and the panel-frame block maps each cause to its copy through `causeMessages`.
- **FR-007**: State changes MUST animate within the direction's motion rules, complete in under
  300 ms, and MUST be disabled when the device's reduce-motion preference is set.
- **FR-008**: Every refreshed screen MUST work at 360 px wide with no horizontal scrolling, tap
  targets of at least 44 px, and the layout shown in the phone mock-up. From 1024 px wide,
  content MUST be centred within one maximum width with tiles in a single row and the category
  bars and entries table side by side, nothing stretching beyond that width; desktop
  interactive elements MUST be at least 24 px, with dense table rows and menu items allowed
  32 px.
- **FR-009**: Every refreshed screen MUST meet WCAG 2.2 Level AA in both themes: the automated
  audit reports no serious or critical issues, every interactive element is operable by
  keyboard with a focus indicator at least 2 px thick at 3:1 contrast against its unfocused
  state, text contrast is at least 4.5:1 (3:1 for large text and non-text controls), and no
  motion runs that the device's reduce-motion preference cannot switch off.
- **FR-010**: The refresh MUST NOT change any workflow: every task a user could complete before
  MUST take no more taps, keystrokes or screens after, measured against a baseline file of
  per-journey counts committed before the token change merges. A tap is each pointer
  activation, a keystroke each key press (typed characters included), a screen each change of
  route; opening a sheet or dialog is not a screen. The only permitted increase is an
  unavoidable WCAG 2.2 AA step, raised in the baseline in the same change with its reason and
  the owner's approval.
- **FR-011**: Numeric figures MUST use aligned, tabular digits so amounts in a column can be
  compared by eye. The primary figure of a tile MUST be its most prominent element, meaning it
  has the largest computed type size on the screen. Secondary information uses
  `--color-fg-muted` at `--text-sm` or smaller.

Building blocks

- **FR-012**: Shared building blocks (buttons, inputs, selects, tabs, menu buttons, theme
  toggle, keyboard hints, sheets, toasts, panel frames, skeletons, empty and error states,
  tables, tiles) MUST be the only source of those elements on
  every screen, each with documented variants and states in both themes and a usage example in
  one browsable catalogue. Icons are inline SVG or text glyphs inside the `packages/ui` blocks,
  with no icon font or icon library, and every icon-only control has an accessible name.
- **FR-013**: Tokens (type, spacing, colour roles, motion) MUST live in exactly one place; a
  change there MUST reach every screen without per-screen edits.

Rollout

- **FR-017**: The refresh MUST reach users screen by screen: the direction's tokens land in one
  change, then each screen is refreshed in its own change reviewed on the preview deployment;
  there is no runtime switch between the old and new look and never two token sets in the
  product at once. Every signed-in screen is in scope: the five core-flow screens and the Today
  view are refreshed one change each, and every other screen, including flagged spec 002–003
  panels and widgets, in changes grouped by area; flagged screens are refreshed behind their
  existing flags without changing them.
- **FR-018**: Visual snapshots MUST be rendered only in the pinned browser container CI uses,
  with animations disabled and the clock frozen; a screen or block matches its snapshot when at
  most 0.5 % of its pixels differ. The tolerance is per image and every image is one viewport
  (360 × 800 or 1280 × 800); content below the first viewport is captured as element
  snapshots of each panel, never as a full-page image. This applies to every visual snapshot
  in the suite and overrides tolerances written in earlier specs (spec 001's year-view
  snapshots are re-baselined under it). A re-baseline caused by a container, browser or font
  update MUST land on its own, in a change with no other code, and list every affected image,
  so it cannot hide a real regression.

Landing page

- **FR-014**: The landing page MUST share the direction's type, colour roles and tone. It MUST
  show screenshots generated from the refreshed app screens in both themes, each visitor seeing
  the one that matches their theme (`prefers-color-scheme`). It MUST present the three-step
  explanation and the sign-up action within the first 360 × 800 viewport on a phone.

Scope

- **FR-015**: The refresh applies to both the signed-in app screens and the marketing landing
  page; the app screens come first and the landing page last. The landing page is published
  (deployed to its public host through `LANDING_ENABLED`) only after the product name is
  decided.
- **FR-016**: The direction MAY propose a new visual identity (type family, accent, backgrounds,
  theme treatment) drawn from the reference design systems; a new identity MUST be recorded as
  a decision (ADR-0006) and approved by the owner before any screen changes, and the fixed
  rules that survive regardless are: three theme states, status colours never reused as chart
  series, hand-written charts, and no new runtime dependency. Before acceptance the proposed
  identity MAY appear only in the block catalogue and the coded mock-ups on dev and preview
  deployments; shipped screens keep the existing system. Because the constitution (Principle VI)
  names the type family and the green accent, accepting an identity that replaces either MUST
  also amend the constitution in the same change (a MINOR version, with ADR-0006 as its ADR,
  merged only by the owner) and update `CLAUDE.md`; choosing the fallback needs no amendment.
  A replacement type family MUST be self-hosted, licensed for web use, loaded with
  `font-display: swap` and metric-matched fallbacks, and allowed by the existing CSP. If the
  proposed identity fails a contrast pair or the Lighthouse budget in the mock-ups, the
  proposal is adjusted; if it still cannot pass, the fallback is used.

### Key Entities *(include if feature involves data)*

- **Design direction**: the approved document: character, references and licences, scales,
  colour roles, motion rules, block conventions, kept/adjusted/replaced decisions, mock-ups.
- **Building block**: a reusable element with named variants and states, documented in the
  catalogue; screens are composed from blocks only.
- **Token**: a named value (type size, spacing step, colour role, motion duration) defined once
  and referenced everywhere.
- **Visual snapshot**: the recorded appearance of a block or screen in a given theme and width,
  compared on every change; one viewport or one panel per image, matching when at most 0.5 % of
  its pixels differ (FR-018).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner approves the design direction within one review round, or returns it
  with named objections resolved in a second round; no third round.
- **SC-002**: Shown the before/after mock-ups without labels, at least four of five people
  outside the project choose the "after" as the more finished product.
- **SC-003**: Every refreshed screen passes the accessibility audit with zero serious or critical
  issues at 360 px and desktop width in both themes, and keyboard-only completion of the core
  flows succeeds in a test with a screen reader (NVDA on Windows and VoiceOver on iPhone, run
  once on the preview deployment by the owner; `needs-rostom`). A flow passes when it is
  completed keyboard-only, every control on the way is announced by name and role, and there
  are no dead ends.
- **SC-004**: Performance and accessibility budgets on the app and the landing page stay at or
  above their current thresholds (performance ≥ 90, accessibility ≥ 95) on the throttled mobile
  profile after the refresh.
- **SC-005**: Zero workflow regressions: each core flow (sign in, add an expense in a foreign
  currency, change month, edit budget, open settings) takes the same or fewer taps, keystrokes and screens than the counts
  in the baseline file committed before the token change, measured in the same automated
  journeys.
- **SC-006**: A contributor (someone who knows Vue but is new to this repository) builds a new panel from the documented blocks alone in under thirty
  minutes and it passes the visual and accessibility checks first time.
- **SC-007**: After the refresh, no screen contains a type, spacing or colour value outside the
  direction's scales (checked automatically); token changes reach every screen with no
  per-screen edit.
- **SC-008**: Three people outside the project open the landing page on a phone, describe the
  product in one sentence and find sign-up without help.

## Design workflow requested by the owner

The input names six tools to be used while producing the direction and the screens. They are
the owner's chosen method, not user-facing requirements, and belong to the planning and
research phase; they are listed here so they are not lost and so the plan can record what each
contributed. Every tool is used as an input to the direction; none of them decides anything on
its own, and any output that conflicts with a fixed design decision is handled by FR-002.

1. Install the "impeccable" design skills and use them to critique the current screens and the
   draft direction.
2. Add the "taste" skill and use it to judge the candidate directions.
3. Add the "awesome-design-md" collection of reference design systems, shortlist the ones that
   suit a daily-use finance tool on a phone, and recommend the best fit with reasons and licence
   notes (this produces FR-001's references).
4. If a reference site is worth studying closely, capture its structure with the "npxskillui"
   tool as study material only; nothing captured is shipped (edge case on licences).
5. Run the UI/UX guidance skill for the chosen product type, palette and typography and fold its
   recommendations into the direction.
6. Consult the "Magic UI" component reference for motion and component ideas; because it targets
   a different front-end framework than Desk uses, it is a source of ideas, not of code.

## Assumptions

- The refresh refines feature F6 from the platform decision record (roadmap Phase 4, "Premium
  UI, PWA, landing page"); it does not add product features. Phase 4 and specs 002–003 have
  shipped, so it starts on the product as built and covers every signed-in screen (FR-017);
  screens built afterwards adopt the direction through the shared blocks (User Story 3).
- SC-002, the SC-003 screen-reader pass, SC-006 and SC-008 need real people and are
  `needs-rostom`: they never block a screen change, and the feature is not called done until
  their results are recorded in `docs/ROADMAP.md`. Each result records the date, who ran it,
  what was run (tools, devices, flows) and pass or fail.
- The direction is free to propose a new visual identity (FR-016); until ADR-0006 is accepted
  the existing design system stays in force, the direction presents the identity as a
  kept/adjusted/replaced table (FR-002) so the owner approves one delta, not many, and a
  rejection falls back to the refinement variant drafted alongside it.
- Reference design systems are used for principles and scales; no proprietary asset is copied
  and each reference's licence is recorded in the direction.
- The building-block catalogue is a page inside the project's own tooling, viewable locally and
  on the preview deployment; it is not a public site.
- Visual snapshots are compared automatically on every change in both themes at phone and
  desktop widths; an intentional change updates the snapshot in the same change; the coded
  "after" mock-ups are the first baselines.
- "Accessibility threshold" everywhere in this spec means WCAG 2.2 Level AA; the 44 px tap
  target is a deliberate stricter choice than the AA minimum of 24 px.
- No new runtime or dev dependency is introduced for the refresh; the design tools in the workflow
  section are authoring aids used during planning and development, not part of the shipped
  product.
- The landing page story waits for the product name decision to be published, but its layout
  and blocks can be built under the working name; it is already built and has a deploy job
  gated by `LANDING_ENABLED` (off).
- English interface only, as for the rest of the product.
- Out of scope: new features or data, changes to any workflow, a public design-system site,
  per-user themes beyond light, dark and system, and marketing content beyond the three-step
  explanation already planned. The F6 items that are behaviour rather than look (command
  palette, keyboard shortcuts, PWA install prompt) are existing or separate work and are not
  part of this feature, even though the roadmap groups them under "Premium UI".
- Terms: a **block** is a shared building block in `packages/ui` (also called a component in
  code), and the **direction** is the root `DESIGN.md`. The rest of this spec uses those two
  words.
