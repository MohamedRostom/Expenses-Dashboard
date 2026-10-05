# Reference shortlist

Spec 004 task T024, written 2026-10-05. The question: which three DESIGN.md files from the awesome-design-md collection are worth keeping beside the repo as study material for a daily finance tool used on a phone, given that `DESIGN.md` already fixes IBM Plex, one Ledger Green accent, Focus Blue, two shadow heights, tabular figures, reserved status colours, hand-written SVG charts and three theme states.

The collection was cloned with `git clone --depth 1 https://github.com/VoltAgent/awesome-design-md` into the session scratchpad, outside the repo, at commit `13be5c05c63be24b57581162364167028020f043`. It holds 70-odd files under `design-md/<site>/DESIGN.md`. Each is an extracted analysis of a public marketing site (several say "inspired interpretation"), so what they describe is a brand's website, not a product's in-app chrome. That limits how much transfers to Desk's screens.

No brand asset, logo, illustration or icon is reused. Only principles and scales may be borrowed, and nothing from the references has been copied into `tokens.css`, `DESIGN.md` or any component.

## Candidates

All candidates sit at `<clone>/design-md/<name>/DESIGN.md`. Licence for every one: the collection's MIT licence (copyright 2026 VoltAgent), which covers the collection's text, not the brands' marks or trademarks.

| Candidate | Type scale | Density and dark theme | Numerics | Forms, tables | Motion | Verdict for Desk |
|-----------|-----------|------------------------|----------|---------------|--------|------------------|
| `linear.app` | 12 / 14 / 16 / 18 / 20 / 22 / 28 up, negative tracking scaling with size (0 at body), weights 400 to 600 only | Dense; dark-only marketing canvas (`#010102`) with a four-step surface ladder and hairlines; no light theme documented | Mono only for code; nothing on money | 8px controls, 8px by 12px inputs, 44px touch inputs, 2px focus ring | Not documented beyond states | **Recommend.** Best on density, the surface ladder and phone touch sizing |
| `stripe` | 10 / 11 / 13 / 14 / 15 / 16 and up; weight 300 display with negative tracking | Light-first, white and `#f6f9fc`; a dark "dashboard track" mentioned | The strongest: `tnum` on every money cell with tightening tracking, called out as a signature | 6px inputs with a cooler hairline, 12px cards, hairline plus a Level 1 shadow | Not documented | **Recommend.** Numerics, calm status colour, and elevation values that match Desk's two tokens |
| `supabase` | 48px display down to body; weight 500 display, 400 body, negative tracking | Light and near-black; dense product mockups | System mono for code; no money conventions | 6px buttons, 4px inputs, 8px compact cards, hairline default card | Not documented | **Recommend (replaces Vercel from R2).** The closest analogue to Desk's single-green-accent system |
| `vercel` | Display 600 with -2.4px tracking, Geist, 12 to 13px mono captions | Light-first, monochrome, hero mesh gradient | Geist Mono for labels | 8px cards, stacked three-layer soft shadow plus an inset hairline ring | Not documented | Runner-up. Its stacked-shadow idea overlaps Stripe's, and the mesh gradient is rejected |
| `revolut` | 80 to 136px display | Black canvas, cobalt-violet plus a wide saturated product palette | none documented | none documented | Not documented | Reject: oversized brochure display type and a wide palette break One Ink |
| `wise` | Weight 900 at 64 to 126px | Pale green-tinted canvas, lime accent, sage neutrals | Mono-caps table headers; currency rows with flag thumbnails | Buttons about 48px tall (AAA), elevation by surface contrast, no shadow | Not documented | Reject: heavy display weight and flat surface-contrast elevation contradict Plex and the shadow rule. Its 48px touch buttons are noted |
| `coinbase` | 44px display at weight 400 | White and `#0a0b0d` dark bands, single blue accent | Coinbase Mono | 44px pill buttons, depth by card-on-card layering, no shadows | Not documented | Reject: pill shapes, proprietary face, and "no shadows" contradicts Two Heights. Its 44px button height confirms `--target-min` |

Not available in this clone: Mercury. Notion and Shopify Polaris were ruled out in R2 and were not re-read. skillui was not used (optional in the brief; no reference site needed scanning once the DESIGN.md files existed).

## The recommended three

R2 provisionally picked Linear, Stripe and Vercel. The evidence says swap the third: **Supabase instead of Vercel.** Vercel's contribution (stacked soft shadows with an inset hairline, monochrome hierarchy, mono captions) is mostly already covered by Stripe's two elevation levels, and its file is 42 KB of marketing-hero material (mesh gradient, showcase imagery) that does not map to a month view. Supabase has the property Desk actually has and the other two lack: **one green accent, with dark text on the green fill** ("near-black, not white. The button reads as a lit surface"), 6px buttons and 4px inputs, a hairline default card and Level 1 and Level 2 shadows. Vercel stays the first alternate if the main session prefers R2's choice, and the file can be added later without conflict.

1. **Linear: density, a surface ladder, touch sizes.** Four dark surface steps carry hierarchy; type steps stay small with weight 600 at most; inputs hold 44px on touch and CTAs 40px or more.
2. **Stripe: money type and elevation.** `tnum` on every money or numeric cell is the explicit convention, and its Level 1 (`0 1px 3px`) and Level 2 (`0 8px 24px` plus `0 2px 6px`) shadows are the same size and softness as Desk's Raised and Overlay tokens, so they confirm the scale rather than disturb it.
3. **Supabase: a single green accent system.** Only one chromatic event per screen, text on the green in a dark colour, radii at 4px and 6px, and a clear three-step elevation table (of which Desk may use two).

## Fit and conflict against DESIGN.md and PRODUCT.md

| Reference | Borrowed (principles and scales only) | Rejected | Conflicts with fixed rules | ADR-0006 `replaced` row? |
|-----------|--------------------------------------|----------|----------------------------|--------------------------|
| Linear | Small-step type ramp with negative tracking only on display; weight capped at 600; a stepped dark surface ladder (Desk already has Sheet and raised Sheet in dark); 44px touch controls; a 2px focus ring | The lavender accent, near-black `#010102` canvas, dark-only theme, "no shadow" depth, Inter or SF Pro as the face, 80px display sizes, pill toggles, customer-logo and marquee patterns | **Depth by surface ladder and hairline instead of shadow** contradicts the Two Heights Rule in light; **dark only** contradicts the three theme states; accent colour is not Ledger Green | No, provided only the dark ladder is borrowed. Adopting hairline-instead-of-shadow would need a `replaced` row, and this audit recommends against it |
| Stripe | `tnum` on money cells; a 6px input radius with a cooler input border; Level 1 and Level 2 shadow recipes; calm status colour (no red or green fills on neutrals) | Weight 300 display, Sohne and `ss01`, the gradient mesh, indigo, ruby and magenta, pill buttons, cream bands, composited dashboard mockups | **Thin 300 weight** conflicts with Plex 400 and 600; **pill buttons** conflict with the 6px control radius; **blue-tinted shadows** conflict with neutral ink shadows; more than one chromatic colour conflicts with One Ink | No |
| Supabase | One accent per screen; dark text on the green fill in dark mode; 6px buttons and 4px inputs; hairline default cards with a Level 1 lift; light and dark designed together | Circular (proprietary), 64px display with -1.92px tracking, hero and landing patterns, the inverted dark pricing tier, **Level 3 `0 16px 48px` modal shadow** | The Level 3 shadow is a **third elevation**, rejected under Two Heights; emerald `#3ecf8e` is not Ledger Green and is not adopted | No |

PRODUCT.md fit: all three are quiet, product-first and unornamented, which matches "Calm over busy" and "Exactness earns trust". None offers anything for multi-currency or "as of" provenance, so those surfaces stay Desk's own work. None of the three conflicts with a named brand commitment, because no name, logo or voice is imported.

Hand-written SVG charts, status-colour reservation, IBM Plex and Focus Blue are not touched by any of the three: none of the files says anything about charts, and each uses its own face and accent, which are not borrowed.

## ui-ux-pro-max findings

Run as `search.py "finance dashboard mobile-first Vue" --design-system` plus typography and chart domain queries, from the scratchpad, with no `--persist`; nothing was written into the repo. (The plugin's `scripts` and `data` entries are text-file symlinks on this Windows install, so the script was run from its real path under `src/ui-ux-pro-max`.)

It recommended: pattern "Minimal Single Column" (a one-CTA landing page), style "Exaggerated Minimalism" (bold, oversized type, negative space), palette `#0F172A` with a green accent `#22C55E` on a `#020617` background, font pairing Fira Code with Fira Sans, and for charts a radar or waffle suggestion. Its general rules check out against Desk's needs: tabular figures for data columns and prices, 44px touch targets with 8px gaps, semantic colour tokens, skip links, visible focus, a 40 to 60 percent scrim, and "no horizontal scroll on mobile".

Clashes with the fixed rules, all rejected: the landing-page pattern and Exaggerated Minimalism are wrong for an app screen; the dark-first palette and `#22C55E` are a second green accent against Ledger Green; Fira Code and Fira Sans replace IBM Plex; radar and waffle charts are chart types Desk's hand-written SVG layer does not have (bars with budget ticks plus a table view is the rule); its "icons from Heroicons or Lucide" advice would add an icon set the product does not have. Its useful, rule-compatible items overlap what `BASELINE-AUDIT.md` already flags (tap targets, skip link, tabular figures, scrim strength).

## Copies in the repo

Three files were copied unmodified from the clone to `docs/design/references/linear.DESIGN.md`, `stripe.DESIGN.md` and `supabase.DESIGN.md`. Each starts with an HTML comment giving the collection's MIT notice (verbatim from its `LICENSE`), the source URL and the cloned commit hash. The licence itself is at `docs/design/references/LICENSE.awesome-design-md`. Nothing else from the clone was copied.
