# Baseline audit: month view, add expense, settings

Spec 004 task T024. Run on 2026-10-05 on branch `phase-4/ui-baselines` against the shipped screens, before any refresh. **How it ran.** The compose stack (`infra/docker-compose.yml`) was already up and was reused: web at `http://localhost:5173`, API on 3000, Mailpit on 8025. The `widgets.*` flags were switched on in the compose database, as `enableWidgetFlags` does in `tests/e2e/fixtures/index.ts`. A throwaway Playwright script (kept in the session scratchpad, not committed) signed up a fresh user through the real verify-by-email flow, set five category budgets, added eight expenses (one over budget in two categories) and two widgets, and screenshotted `/`, `/add`, `/settings` plus the month view's Add-expense dialog at 360x800 and 1280x800, light and dark. The shots were studied and discarded; none is committed. Two environment workarounds: Playwright's bundled Chromium would not download, so the script drove the installed Edge (`channel: 'msedge'`), and that browser hung on `localhost` here, so it used `127.0.0.1:5173`. Tool versions: impeccable 4.1.0 (skill, `context` loader and detector), Playwright 1.63.0, ui-ux-pro-max 2.5.0, awesome-design-md at `13be5c05`.

**Limitations, stated up front.**
1. The impeccable critique ran **degraded, single-context**: no sub-agent tool exists inside this run, so the design review and the detector evidence were not isolated from each other, and the critique snapshot was not persisted to `.impeccable/critique/` (this task is docs-only). `impeccable context` resolved the root PRODUCT.md and DESIGN.md from `apps/web`.
2. The detector's URL mode cannot carry a session (it has no cookie or storage-state option), so a URL scan of `/`, `/add` or `/settings` lands on the `/login` redirect. URL mode was run at both viewports anyway and is reported below. **Per-screen detection used source-file mode** on each view and the components it renders. Source mode has no viewport; the viewport-specific evidence in this file comes from the screenshots and from computed-style measurements taken in the real app (tap-target sizes, fonts, shadows, overflow).
3. Measurements are from one account with eight expenses. Error, loading and empty states beyond the "No widgets yet" empty state were not exercised.
4. Skeleton, error and empty state coverage per constitution VI is not audited here; it belongs to the screen tasks.

**Detector results.**

| Screen | Mode | Non-advisory | Advisory |
|--------|------|--------------|----------|
| `/login` (what URL mode reaches, 360x800 and 1280x800) | URL | 1: `low-contrast` 2.2:1, `#ffffff` on `#5fbf9f` (the dark-theme Feedback button, see F-APP-1) | 0 |
| Month (`MonthView.vue`, `ForecastTile`, `widgets/*`, `Tile`, `PanelFrame`, `DataTable`, `Dialog`, `EmptyState`, `ErrorState`, `Button`, `Toast`) | source | 0 | 7: five `design-system-font-size` (0.8rem or 0.7rem), two `design-system-color` (`rgb(0 0 0 / 40%)` in `Dialog.vue:87`, `rgb(0 0 0 / 20%)` in `Toast.vue:64`) |
| Add (`AddView.vue`, `ExpenseForm.vue`, `CurrencyPicker.vue`, `Input`, `Select`, `Button`) | source | 0 | 2: `0.8rem` in `Input.vue:76` and `Select.vue:69` |
| Settings (`SettingsView.vue`, `WeatherSettings.vue`, `Input`, `Select`, `Button`) | source | 0 | 4: `border-radius: 999px` at `SettingsView.vue:455`, `0.8rem` at `:457`, plus the two `Input`/`Select` ones |
| App shell (`App.vue`, `FeedbackWidget.vue`), on every screen | source | 0 | 3: `999px` radius `FeedbackWidget.vue:110`, `rgba(0,0,0,0.15)` `:123`, `0.8rem` `:133` |

The detector reports zero non-advisory findings in source mode. Everything below that matters came from the browser measurements and the critique, which the source scan cannot see (computed tap sizes, contrast on rendered colours, overflow, missing rules).

**Impeccable critique summary (degraded, single-context).** Mode: Operate. Design specificity: the money surfaces are authored (Plex Mono figures, a budget tick, red only when over) but the chrome around them is interchangeable (UA default headings, plain text nav, flat bordered boxes). Heuristic scores out of 4: visibility of status 3, match with real world 3 (the "USD USD" slip costs a point), user control 3, consistency 2 (a local copy of the tile, three container widths, UA headings), error prevention 3, recognition 3, flexibility 2, minimalist design 2 (eighteen rows of "$0.00" categories), recovery n/a (not exercised), help 2. Total 23/36, about 64 percent, "Acceptable: significant improvements needed". Persona red flags: Casey (phone, one thumb) hits 20px nav links, 35px inputs and a floating Feedback button that sits on the form's action row; Sam (keyboard and low vision) gets UA focus rings on the nav, no skip link, no `<main>` on Settings and a dark-theme over-budget red at 2.8:1; Alex (power user) found no keyboard shortcut for Add expense in the source.

**redesign-existing-projects audit.** Applied the skill's checklist read-only. It flags: no `:hover` or `:active` state on `Button.vue` (the only state is focus), no skip-to-content link, no custom 404 route (`router.ts` has none), a card look built from border plus flat fill (the pattern it calls generic), headings left at browser defaults, and a long unbroken settings form. Its suggestions to swap the font, add noise textures, tint shadows toward the background hue, and prefer zig-zag layouts are rejected: IBM Plex, flat Ledger Green, neutral black Raised/Overlay shadows and the two-column month layout are fixed by DESIGN.md.

---

## Month view (`/`)

Source: `apps/web/src/views/MonthView.vue`. Two entry points exist for adding an expense: the **Add expense** button opens a `Dialog` here, while `/add` is a separate page (`AddView.vue`) around the same `ExpenseForm`. There is no separate sheet component.

### 360 wide

Counts: P1 7, P2 6, P3 1.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| M-1 | P1 | The page scrolls sideways: `scrollWidth - innerWidth` = 13px. The Budget tile's value wraps to two lines ("$1,570.00 / USD") and the table wrapper is wider than the viewport. The exact overflowing node was not isolated. | `MonthView.vue` tiles `:455-475`, `.desk-entries-table-wrap` `:298` | FR-019, Layout |
| M-2 | P1 | Interactive controls under 44px (36 of them): all nine nav links and Sign out are 20px tall; month pager ‹ › 26x25; **Add expense** and **Add widget** 38px; the widget ⋯ menu 24x23; widget menu buttons 31px; entry **Edit** 23x15 and **Delete** 39x15. | `App.vue:46-85`, `Button.vue:30-32`, `MonthView.vue` pager `:403-410`, `.desk-entries-actions` `:335` | `--target-min` 44px, Accessibility |
| M-3 | P1 | The fixed Feedback button (91x31) floats over content and covers part of the Budget tile. | `FeedbackWidget.vue:101-116` | Layout, Tap targets |
| M-4 | P1 | Currency printed twice in every category row: "$0.00 USD USD", "$240.50 USD / $200.00 USD USD". `CategoryBars` appends `{{ currency }}` after `formatMinor`, and `MonthView` passes a `format-money` that already adds the code. | `CategoryBars.vue:52-57`, `MonthView.vue:290` | Principle 1 (exactness), copy |
| M-5 | P1 | Entry amounts are proportional Plex Sans, not tabular Plex Mono: 6 of 62 money strings fail (the whole Amount column, plus the pending-queue rows). Tiles, bars and the summary table pass. | `MonthView.vue:344` (also `:319`, `:334`), no rule on `.desk-entries-table td` | Tabular Figures Rule |
| M-6 | P1 | Dark only: over-budget fills and values use `--color-critical` `#a83a2e`, 2.81:1 on Night Desk and 2.53:1 on Sheet Dark. Below 3:1 for the bar fills and far below 4.5:1 for the red figure text. | `tokens.css:88` and `:114`, `CategoryBars.vue:121-122` | T028 gap, Accessibility |
| M-7 | P1 | Dark only: the Feedback button is `color: white` on `#5fbf9f` (2.22:1); DESIGN.md says text on a green fill in dark is Night Desk. This is the one failure the URL detector reports. | `FeedbackWidget.vue:110-116` | Colors, Accessibility |
| M-8 | P2 | Tiles are drawn with a 12% ink hairline and no shadow. The month view even carries a private copy of the tile (`.desk-tile`, `MonthView.vue:461-475`) instead of using `@desk/ui`'s `Tile`, so there are two to fix. | `MonthView.vue:461-465`, `Tile.vue:36-38` | Two Heights Rule, drift note |
| M-9 | P2 | Widget frames are hairline-only, no Raised shadow. Their 12rem fixed height leaves large empty bottoms (Spend pace is about 40% empty). | `PanelFrame.vue:258-259`, `:252` | Two Heights Rule |
| M-10 | P2 | The Add-expense dialog has a scrim but no Overlay shadow; the dialog surface is Grey Paper rather than Sheet. | `Dialog.vue:80-95` | Elevation, Two Heights Rule |
| M-11 | P2 | The page has no `h1` and no page title; the first heading is the month pager. | `MonthView.vue` template | Accessibility (heading order) |
| M-12 | P2 | Eighteen category rows render as "$0.00" bars and table rows, so the three that matter (over budget) are lost in the list. | `MonthView.vue:285-296` | Principle 4 (calm over busy) |
| M-13 | P2 | The pending-rate line and "estimated, not yet synced" copy explain nothing the user can act on. | `MonthView.vue:261-266` | Voice, error copy |
| M-14 | P3 | Off-scale literals: tile label `0.8rem`, widget `0.7rem`, add-widget sheet `0.8rem`. | `MonthView.vue:468`, `WidgetStrip.vue:258`, `AddWidgetSheet.vue:141`, `Tile.vue:43`, `PanelFrame.vue:288` | Type ramp (advisory) |

### 1280 wide

Counts: P1 4, P2 8, P3 1.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| M-4 | P1 | Same "USD USD" duplication. | as above | as above |
| M-5 | P1 | Same non-mono entry amounts. | as above | as above |
| M-6 | P1 | Same dark critical contrast (dark only). | as above | as above |
| M-7 | P1 | Same dark Feedback contrast (dark only). | as above | as above |
| M-8, M-9, M-10 | P2 | Same flat bordered tiles, frames and dialog. | as above | as above |
| M-11, M-12 | P2 | Same missing `h1` and zero-row noise. | as above | as above |
| M-15 | P2 | Nav links and Sign out are 20px and Edit/Delete 15px tall, below the 24px desktop floor. | `App.vue:46-85`, `MonthView.vue:335` | PRODUCT.md accessibility |
| M-16 | P2 | The content column is 60rem (960px), not the documented 72rem, and the Forecast tile drops to a second row instead of the single tile row DESIGN.md describes from 1024px. | `MonthView.vue:379`, `:455` | Layout |
| M-17 | P2 | Two 230px widget frames sit left-aligned with the title wrapping to two lines ("Spend / pace") in the dark theme; the strip does not use the width. | `WidgetStrip.vue`, `PanelFrame.vue:256-290` | Widget Frame |
| M-14 | P3 | Same off-scale literals. | as above | as above |

---

## Add expense (`/add`)

Source: `apps/web/src/views/AddView.vue`, form in `apps/web/src/components/ExpenseForm.vue`. The same form appears in the month view's dialog (shot reviewed; same findings).

### 360 wide

Counts: P1 2, P2 2, P3 3.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| A-1 | P1 | The core phone flow is the least thumb-friendly screen: 21 interactive elements under 44px. Text inputs are 35px, date 37px, the three selects 37px, **Add expense** and **Cancel** 38px, **Set manual rate** a 15px-tall text button, nav links 20px. | `Input.vue`, `Select.vue`, `Button.vue:30-32`, `ExpenseForm.vue:217` | `--target-min`, SC-009 (15-second add) |
| A-2 | P1 | Dark only: Feedback button white on mint, 2.22:1 (see M-7). | `FeedbackWidget.vue:110-116` | Colors |
| A-3 | P2 | The Feedback button (91x31) is fixed on the same row as **Add expense** and **Cancel**, within a thumb of the primary action. | `FeedbackWidget.vue:101-108` | Layout, Tap targets |
| A-4 | P2 | `h1` is the browser default 32px (2em) and not a documented step (Headline is 28px, Display 40px). | `AddView.vue` template, no heading rule | Typography ramp |
| A-5 | P3 | Two add paths (`/add` page and month-view dialog) share one form with different chrome; keep or collapse deliberately. | `AddView.vue`, `MonthView.vue:356-362` | consistency |
| A-6 | P3 | Field labels and helper at `0.8rem` and `0.85rem`. | `Input.vue:76`, `Select.vue:69` | Type ramp (advisory) |
| A-7 | P3 | The native date input shows Chromium's segment highlight instead of a Focus Blue ring; the e2e journey exempts it. | `tests/e2e/tests/journeys.spec.ts:59` | Focus Is Blue Rule, T033 carry-forward |

### 1280 wide

Counts: P1 1, P2 2, P3 3.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| A-2 | P1 | Same dark Feedback contrast. | as above | as above |
| A-4 | P2 | Same default `h1`. | as above | as above |
| A-8 | P2 | Nav links are 20px tall, below the 24px desktop floor; inputs and buttons (35 to 38px) pass. | `App.vue:46-85` | PRODUCT.md accessibility |
| A-5, A-6, A-7 | P3 | Same as 360. | as above | as above |

---

## Settings (`/settings`)

Source: `apps/web/src/views/SettingsView.vue`. Ten sections in one column: Profile, Default currency, Theme, Time zone, Widgets, Sessions, Phone capture, Export, Delete account, plus the feedback button.

### 360 wide

Counts: P1 3, P2 5, P3 1.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| S-1 | P1 | No page gutter: the form runs edge to edge. Inputs and buttons measure 360px, the full viewport, and the title sits at x=0. The 16px gutter other screens get from their `main` padding is missing. | `SettingsView.vue:415-420` (`.settings-view` sets `margin: 2rem auto` and a max-width but no horizontal padding) | Layout (16px gutter) |
| S-2 | P1 | 22 controls under 44px, including 13x13 radio buttons (temperature unit), 35px inputs, 38px buttons and 20px nav links. | `SettingsView.vue`, `Input.vue`, `Button.vue` | `--target-min` |
| S-3 | P1 | Dark only: Feedback button contrast 2.22:1 (see M-7). | `FeedbackWidget.vue:110-116` | Colors |
| S-4 | P2 | The Feedback button (fixed, 91x31) overlaps the Theme section heading row. | `FeedbackWidget.vue:101-108` | Layout |
| S-5 | P2 | Section headings are default `h2` at 24px and `h1` at 32px, not Title 1.125rem / Headline 1.75rem. | `SettingsView.vue` template | Typography ramp |
| S-6 | P2 | Two solid Ledger Green buttons (Change email, Save time zone) share one scroll with outlined ones, diluting the One Ink Rule, and **Delete account** is a solid Critical Red trigger although DESIGN.md reserves the red fill for destructive confirmations. | `SettingsView.vue` template, `Button.vue:65` | One Ink Rule, Buttons |
| S-7 | P2 | No `<main>` landmark on the page (`document.querySelector('main')` is null); the other two screens have one. | `SettingsView.vue:269`, `App.vue` | Accessibility |
| S-8 | P2 | Ten ungrouped sections make a 2195px scroll with no jump links, so a person looking for the capture address has to scan the whole page. | `SettingsView.vue:271-400` | Cognitive load |
| S-9 | P3 | Off-scale literals: `999px` radius and `0.8rem`. | `SettingsView.vue:455`, `:457` | Rounded and type scales (advisory) |

### 1280 wide

Counts: P1 1, P2 5, P3 2.

| ID | Sev | What | Where | Touches |
|----|-----|------|-------|---------|
| S-3 | P1 | Same dark Feedback contrast. | as above | as above |
| S-5, S-6, S-7, S-8 | P2 | Same headings, solid buttons, missing landmark, long form. | as above | as above |
| S-10 | P2 | Nav links 20px and the 13px radio buttons are below the 24px desktop floor. | `App.vue`, `SettingsView.vue` | PRODUCT.md accessibility |
| S-9 | P3 | Same off-scale literals. | as above | as above |
| S-11 | P3 | Content widths disagree across screens: nav spans the page, Settings is 32rem, Add 28rem, Month 60rem; the nav's left edge (x=16) lines up with none of them. | `SettingsView.vue:416`, `AddView.vue`, `MonthView.vue:379` | Layout |

---

## Where the screens break DESIGN.md's named rules

**1. Hairline border instead of the Raised shadow.** Drift confirmed. `Tile.vue:36-38`, the private tile in `MonthView.vue:461-465` and the widget frame in `PanelFrame.vue:258-259` all draw a 1px border at 12% ink with `box-shadow: none` (measured: `shadow=none border=1px rgb(…/0.12) radius=8px`). `--shadow-raised` is defined in `tokens.css:25` (and the dark twins at `:96`, `:122`) but nothing references it; `--shadow-overlay` is used only by `MenuButton.vue:134`. The Add-expense dialog carries no shadow either (`Dialog.vue:80-95`). Category panels: the category bars on the month view have no frame at all, so there is no hairline to replace; no drift found there. The Categories settings page was not in scope.

**2. Off-scale literals.** Drift confirmed, all listed in `packages/ui/src/drift-pending.json` (52 files) and surfaced by the detector as advisory: `0.8rem` in `Tile.vue:43`, `MonthView.vue:468`, `AddWidgetSheet.vue:141`, `Input.vue:76`, `Select.vue:69`, `SettingsView.vue:457`, `FeedbackWidget.vue:133`; `0.7rem` in `PanelFrame.vue:288` and `WidgetStrip.vue:258`; `0.9rem` on `Button.vue:30` and the nav (`App.vue:58`); `0.85rem` on panel titles, entries table and pager (`PanelFrame.vue:281`, `MonthView.vue:410`, `:492`); `0.6rem` padding in `PanelFrame.vue:257` and `MonthView.vue:407`; 6px radius on `Button.vue:32`, `PanelFrame.vue:307`, `MonthView.vue:404`; `999px` radius on `SettingsView.vue:455` and `FeedbackWidget.vue:110`; scrims and shadows `rgb(0 0 0 / 40%)` (`Dialog.vue:87`), `rgb(0 0 0 / 20%)` (`Toast.vue:64`), `rgba(0,0,0,0.15)` (`FeedbackWidget.vue:123`). Headings use UA sizes of 32px and 24px, which are on no step of the ramp.

**3. Tap targets under 44px on phones.** Drift confirmed on all three screens (36, 21 and 22 controls) as itemised in M-2, A-1 and S-2. `--target-min` is applied only in `MenuButton.vue:157`, `Tabs.vue:101` and `ThemeToggle.vue:87`.

**4. Money not in tabular Plex Mono.** One drift: the entries table amounts and the pending-queue rows (`MonthView.vue:344`, `:319`, `:334`). Tiles, `CategoryBars.vue:107-112`, the summary table and widget figures pass (56 of 62 money strings). The Add form's amount input was not separately measured.

**5. Focus ring not Focus Blue.** Mostly no drift: `Button.vue:39-42` and `Input.vue:60-62` use the 2px Focus Blue ring with a 2px offset. Two gaps: the native `input[type=date]` shows Chromium's segment highlight, exempted in `journeys.spec.ts:59`; and the nav links, Sign out, the pager buttons and the Feedback toggle have no `:focus-visible` rule in `App.vue`, `MonthView.vue` or `FeedbackWidget.vue`, so they show the browser's default ring, not the token.

**6. Dark `--color-critical` contrast (T028 gap).** Confirmed with numbers: `#a83a2e` is 2.81:1 on Night Desk `#121820` and 2.53:1 on Sheet Dark `#1a222c`; there is no dark twin (`tokens.css:88`, `:114`). It fails 3:1 for the over-budget bar fills and 4.5:1 for red text. The light value is fine (white on it is 6.35:1). A related, newly found gap: the white-on-mint Feedback button (2.22:1, M-7). The carry-forward's contract pair `--color-focus` on `--color-accent` is 1.03:1 in light, so a focus ring touching the green primary button would be invisible against the fill; today the 2px offset leaves a gap of page background, which is why it still reads.

**7. Status colours used as series.** Mostly no drift on the audited screens: the category bars use one hue and switch to Critical Red only when over budget, and the amber appears only on the pending-rate line and stale banners. One latent breach: the category seed palette starts with `#a83a2e`, the Critical Red value, so the first category (Rent) is created with Critical Red as its colour (`packages/core/src/categories.ts:45`); it surfaces as a swatch in `CategoriesView.vue:164` and `:188`, not on the three audited screens. The account palette was not re-audited here.

**8. A third shadow or a second accent.** Third shadow: drift confirmed in `FeedbackWidget.vue:123` (`0 4px 16px rgba(0,0,0,.15)`) and `Toast.vue:64` (`0 2px 8px rgb(0 0 0 / 20%)`), neither of which is Raised or Overlay. Second accent: no drift found; Focus Blue, Warn Amber and Critical Red each stay in their own roles.

---

## Summary by screen

| Screen | Viewport | P1 | P2 | P3 | Detector mode | Headline |
|--------|----------|----|----|----|---------------|----------|
| Month `/` | 360 | 7 | 6 | 1 | source (0 non-advisory, 7 advisory) | Overflow, 36 small targets, "USD USD", non-mono entry amounts, dark red contrast |
| Month `/` | 1280 | 4 | 8 | 1 | source | Same data bugs, flat bordered tiles, 60rem column, widget strip underuses width |
| Add `/add` | 360 | 2 | 2 | 3 | source (0 non-advisory, 2 advisory) | 21 controls under 44px on the 15-second flow |
| Add `/add` | 1280 | 1 | 2 | 3 | source | Default `h1`, 20px nav |
| Settings `/settings` | 360 | 3 | 5 | 1 | source (0 non-advisory, 4 advisory) | No gutter, no `<main>`, 22 small targets, solid red delete trigger |
| Settings `/settings` | 1280 | 1 | 5 | 2 | source | Long ungrouped form, widths disagree |
| App shell (every screen) | both | 1 | 0 | 0 | URL `/login` plus source | Dark Feedback button 2.22:1, counted in each screen's P1 above |

## Mock-ups
