# Contract: UI identifiers tests code against

## `<html>` attributes (set by `apps/web/src/views/theme.ts`)

| Attribute | Values | Set when |
|---|---|---|
| `data-motion` | `none` · `aurora` · `grid` · `particles` · `grain` | always; `none` when the flag is off |
| `data-motion-paused` | present / absent | user pause on, or page hidden |
| `data-panels` | `solid` / absent | `panelsTranslucent` false with the flag on |
| `--motion-tint` (inline custom property) | `#rrggbb` | the effective tint for the current theme |

`data-theme` and `data-accent` are unchanged.

## Components (`packages/ui`)

- `BackgroundMotion.vue`: renders the layer for the current `data-motion`; `aria-hidden="true"`; `data-testid="background-motion"`.
- `.surface` rule used by `PanelFrame`, tiles and widgets.
- `.board-grid` layout rule (research R7).

## Settings › Appearance (`apps/web/src/views/SettingsView.vue`)

Shown only with `appearance.motion` on.

| Control | Accessible name | Role and state |
|---|---|---|
| Preset group | "Background motion" | `radiogroup` of five `radio`s with `aria-checked` |
| Colour group (light only) | "Motion colour" | `radiogroup` of six named swatches plus a "Custom colour" `input type="color"`; `aria-disabled="true"` with the note "Applies when a motion is on" while the preset is None |
| Panels switch | "Translucent panels" | `switch` with `aria-checked` |
| Pause switch | "Pause background motion" | `switch` with `aria-checked` |
| Save error | none | `role="alert"` next to the group, copy by error code, with a "Try again" button |

Every control is at least 44 × 44 px.
