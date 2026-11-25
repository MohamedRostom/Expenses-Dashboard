# ADR-0008: Glassy V2, softer glass over a warm ground with the owner's month layout

**Status:** Accepted (2026-11-24; direction approved by the owner 2026-11-14)
**Date:** 2026-11-14
**Deciders:** Rostom (owner)
**Supersedes:** ADR-0007 (Premium identity with ambient motion)
**Relates to:** `DESIGN.md`, `.specify/memory/constitution.md` Principle VI, mock-up `/__ui/mockups/glassy-month` (`apps/web/src/catalogue/mockups/GlassyMonthMock.vue`), a spec 007 still to be written

## Acceptance

Accepted by the owner on 2026-11-24, together with the rewritten `DESIGN.md` and the amended constitution Principle VI (1.4.0). The open questions below are accepted as built: where an "As built" note records a deviation from the table, the as-built behaviour is the decision. Questions 2, 4 and 6 stay drafted as described and may be revisited without a new ADR. The history that led here:

Before acceptance: On 2026-11-14 the owner supplied a reference (a "Glassy Dashboard V2" clip), chose all four parts of it that Desk did not already have, reviewed a coded mock-up of the month view and approved the direction. Later the same day the owner drew the month view in Figma (flat white cards, a fixed sidebar) and chose to keep the glass, the warm ground and the pill controls from this ADR while taking the layout from that frame; the frame was read from the canvas by eye, so its exact sizes and colours are not recorded here. That approval covers the direction only. This ADR takes effect when the owner accepts it together with the rewritten `DESIGN.md` and the amended constitution Principle VI, as ADR-0006 and ADR-0007 did. Until then ADR-0007 and the current `DESIGN.md` stay normative, and nothing outside the mock-up changes. (Superseded by the acceptance above.)

The values below are the mock-up's and are drafts. Six points were the owner's to settle before acceptance; the first was decided on 2026-11-14 and five remain. They are listed under Open questions.

## Context

ADR-0007 gave Desk translucent panels with 16 px corners over one opt-in ambient layer, and kept the Concourse Board's crisp 2 px controls, its text-link header and its rule against an icon bar. Four weeks later the owner asked for the dashboard to look like the reference: rounder and lighter glass, a greeting above a grid of mixed-size tiles, navigation that floats as an icon rail and a pill bar, and a warm, blurred room behind it all.

Desk already has the glass. What the reference adds is shape, layout, navigation and backdrop, and three of those contradict rules that `DESIGN.md` states outright ("No icon tab bar, no hamburger", 2 px buttons, the header as the home of navigation). So this is a new identity decision and not a restyle under ADR-0007.

The mock-up was built to find where the reference cannot be copied as drawn. It found three places. The reference's glass is thin enough that muted text and status amber fail AA over a warm ground. Its navigation is icon-only, which hides where each item goes from anyone who has not learned the icons. Its backdrop is a photograph, which costs image weight on the first paint of routes already under their Lighthouse budget. The decision below takes the look and changes those three things.

## Decision

Adopt "Glassy V2" as the visual identity of Desk, to be written into the root `DESIGN.md`. The delta the owner is asked to approve:

| Decision | ADR-0007 | ADR-0008 |
|----------|----------|----------|
| Panel corners | 16 px on panels, tiles and widget frames | 24 px on panels, tiles and widget frames |
| Controls | 2 px buttons, inputs and tabs; 8 px dialogs | Pill buttons, chips and segmented controls; inputs and selects 12 px; dialogs and sheets 24 px on their free edges (drafted, see Open questions) |
| Glass | White 68 % light, `rgb(21 26 33)` 66 % dark, 20 px blur, `saturate(140%)` | Drafted thinner (white 56 % light, `rgb(26 21 18)` 58 % dark); the composite contrast test set the built values at white 76 % light and `rgb(26 21 18)` 70 % dark, which is thicker than ADR-0007, because status amber and red text fail over the warm ground below that. 24 px blur, `saturate(150%)`, a bright hairline edge |
| Month view layout | Departure tile and two tiles in a row, entries beside category bars | The owner's Figma frame "Desk - Monthly overview" (2026-11-14): a greeting line with "Add expense" at its right; the departure tile beside four stat tiles (spent, daily average, entries, over budget); then recent entries beside the spend-by-month chart and category budgets, with a banner that says in words how many categories are over. One column at 360, content at most 1160 px |
| Filled tile | None; every tile is glass | The departure tile is filled with the accent, and it is the only filled tile on the screen. It is the accent, so the One Signal Rule still holds |
| Navigation | A wrapping row of text links in an opaque header; no icon bar | From 1024 px a glass sidebar, as the owner drew it: wordmark, four labelled icon items (Monthly overview, Today, Widgets, Settings), a Personalise group with Colours, and a tagline. Below 1024 px the same four items are a floating pill bar at the bottom. "Add expense" is a button on the screen, not a nav item |
| Header | Opaque strip with month switcher, links and the add action | A floating top bar holding the screen title, the month switcher and the theme control |
| Backdrop | Five presets: None, Aurora drift, Board grid, Particles, Grain | The same, plus a sixth preset, a warm blurred ground drawn with CSS gradients, which replaces Particles as the default (owner, 2026-11-14) |
| Colours a person may choose | Accent from six presets; a background tint in light mode only | Any colour for three things (owner, 2026-11-14): the accent, the warm ground's tint in both themes, and the highlight of the selected nav item. See Free colours |
| Character | Premium and calm; the background is felt, not read | The same, warmer and rounder; the figures are still the loudest thing on the screen |

Three things are deliberately not taken from the reference:

- **Icon-only navigation.** Every item keeps a visible label. An icon rail without words fails discoverability, and Desk has no icon vocabulary its users already know.
- **A photographic backdrop.** The warm ground is CSS only, like every other preset, so it loads no image and adds no dependency.
- **Glass as thin as the clip's.** Every text pair stays at or above 4.5:1 over every backdrop. Where a pair fails, the panel gets more opaque.

Carried over unchanged from ADR-0007: the system UI and system mono type stacks with tabular figures and small spaced capitals; Signal Green as the default accent and the five accent presets; the three theme states; Focus Blue; Delay Amber and Cancel Red, never a chart series and never a backdrop tint; the account palette; hand-written single-hue SVG charts with a table view one tab away; the departure tile as the largest figure on the screen; status said as a lamp or mark and a word; the arrival flip, settle-in, list travel, bar growth and hover lift under the 280 ms ceiling; opaque dialogs, menus, sheets and toasts; the opaque panel fallback under `data-panels="solid"`, no `backdrop-filter` support, `forced-colors` and `prefers-reduced-transparency`; one background layer only, CSS only, still under reduced motion, reduced data, the user's pause and a hidden tab.

Dropped from ADR-0007: the rule against an icon bar, the text-link header as the place for navigation, the 2 px control radius and the 16 px panel radius.

Release: a change to the look of existing screens ships unflagged (constitution 1.1.1), and that includes the warm ground as the base ground of every signed-in screen. The moving presets and the appearance controls stay behind `appearance.motion`; with the flag off the ground is the warm one in place of today's plain one.

## Free colours

Decided by the owner on 2026-11-14: the accent, the warm ground and the selected nav item each take any colour. As with ADR-0007's motion colour, a colour is never rejected; legibility is held by structure, and the mock-up's rules (`packages/ui/src/glassyColours.ts`, with tests) are the draft of that structure:

- **Text on a chosen colour** is black or white, whichever contrasts more; one of the two always reaches 4.5:1.
- **The accent as drawn** is moved toward black (light) or white (dark) until a bar in it shows at 3:1 on the lightest or darkest panel possible, and the screen says so when it has been moved. The picked value is what is stored.
- **The ground's tint** is mixed into white (light) or black (dark) at no more than 40 % and 30 %. At those caps, body, muted and Cancel Red text stay at 4.5:1 on the ground and under glass even for a black or a white tint. The default tint is a burnt sienna, `#a8501f`.
- **The selected nav item** is the picked colour with black or white text.

This changes two rules carried from ADR-0006 and ADR-0007. The accent is no longer limited to presets whose hue avoids 0 to 60 degrees, so a person can pick a red or an amber accent that looks like Cancel Red or Delay Amber; status still never relies on colour alone (a mark and a word), which is what keeps that safe, and the presets remain as suggestions. And the nav highlight is a second chosen colour beside the accent, so the One Signal Rule narrows to "one accent for actions and spend".

Decided on acceptance (2026-11-24), as built: they are three nullable columns on `users` (`accent_custom`, `ground_tint`, `nav_colour`) set through `PATCH /me`, and the pickers sit behind `appearance.accent`, which is on for everyone since 2026-11-20 (migration 0014), so they need no flag of their own. Still not decided: whether a warning is shown when a chosen accent is close to a status hue.

## Open questions for the owner

1. **Is the warm ground the default?** Decided 2026-11-14: yes. An account that never chose a preset gets the warm ground; an account with a saved choice keeps it. Also decided 2026-11-14: the warm ground shows whether or not `appearance.motion` is on. It is a still ground, part of the look of existing screens, so it ships unflagged with the rest of this identity (constitution 1.1.1); the flag keeps gating the moving presets and the appearance controls. With the flag off, an account sees the warm ground and its saved choice is kept but not applied, as today. Not decided: the signed-out pages keep their own cycling backdrop (ADR-0007 amendment 2026-10-18) unless the owner says otherwise. As built (2026-11-15): the signed-out pages are drawn on the warm ground, taking the owner's "do all the enhancements" (2026-11-15) as the yes; the ten cycling scenes keep their own shapes on top of it. Amended 2026-11-16: the scene colours are now steps of the warm ground tint (the cool `--auth-backdrop-*` tokens are no longer used), so every scene is warm in both themes.
2. **Does the warm ground move?** Drafted as still. A slow drift would make it the second user of the one allowed loop, which the rules permit, but a still preset already exists in "None".
3. **Glass floor.** At the drafted 56 % light, status amber as text measures about 3.8:1 on the darkest part of the warm ground (hand-computed, not yet in the composite test). Either the glass rises until it passes or light-mode amber darkens; this ADR assumes the glass rises. As built (2026-11-15) it rose to 76 % light and 70 % dark; darkening light-mode amber and red instead would let the glass thin again, and that trade is the owner's.
4. **Control radii.** Pill buttons and chips are shown in the mock-up; 12 px inputs and 24 px sheets are drafted and not yet drawn.
5. **Nav items and the phone layout.** The four items are settled by the owner's frame (2026-11-14). The frame is desktop only, so the bottom bar below 1024 px is this ADR's draft and not yet the owner's; Categories, Import and sign-out still need a home, most likely inside Settings. As built (2026-11-15) the items are Month, Year, Today and Settings: Year kept its place and Widgets has no item because widgets are added from the month view. The top bar holds only the screen title; the month switcher stayed in the month view and the theme control in Settings. Update (2026-11-15): the top bar now holds the month switcher and "Add expense", as in the table above. The floating Feedback pill is gone; Feedback is in the sidebar footer at 1024 and above and a row in Settings below. Two nav labels were renamed to "Notion sync" and "Mail and calendar accounts". Categories, Import, Bin, Connectors, Capture and sign-out are in Settings. Each of these is a deviation from the table above for the owner to confirm or reverse.
6. **The greeting.** Fixed text in the mock-up. A time-of-day greeting needs the user's zone and a frozen clock in e2e; a name in it needs a display name Desk does not collect.

## Consequences

- Principle VI of the constitution names ADR-0007's identity, so it is amended in the same change (1.3.0 to 1.4.0) and ADR-0007 is marked Superseded. Only the owner merges either.
- `DESIGN.md` is rewritten: the radius scale, the glass values, the Navigation, Layout, Buttons, Inputs and Tile sections, the Do and Don't lists and the Decisions table. The proposed values then move into `packages/ui/src/tokens.css`, and `GlassyMonthMock.vue` comes off `packages/ui/src/drift-pending.json`.
- Every screen is touched, not only the month view, because navigation and control shapes are shared. Spec 007 carries the screen-by-screen tasks.
- A fixed bottom bar covers content. Every scrolling screen reserves space for it and for the device's safe area, and the toast moves above it.
- The composite contrast test gains the warm preset in both themes and both panel modes before any glass value is final.
- A 24 px blur over a larger share of the viewport costs paint on low-end phones. `/` and `/settings` are measured against the spec 006 numbers; signed-in Lighthouse performance is already under 0.9 and must not regress.
- Every visual baseline, web and landing, is regenerated once.
- No new dependency: icons are inline SVG paths in one stroke weight, so the `worker-build` job is unaffected.

## Alternatives considered

- **Soften the tokens only.** Raise the radii and thin the glass under ADR-0007 and leave layout and navigation alone. Cheapest, and offered to the owner, who chose all four parts.
- **Copy the reference as drawn.** Icon-only rail, photographic backdrop, very thin glass. Rejected for the three reasons under Decision.
- **A chart library for the bento charts.** Rejected; the hand-written SVG layer already draws what the mock-up shows.
- **Keep the text-link header and add the floating bar on phones only.** Two navigation patterns at one level; rejected in favour of one bar that changes position by width.
