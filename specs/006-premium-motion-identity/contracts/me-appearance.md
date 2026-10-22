# Contract: appearance fields on `/me` and public flags

## `UserResponse` (every route that returns the user: `GET /me`, `PATCH /me`, sign-in, sign-up)

Four new required fields beside the existing `theme` and `accent`:

```json
{
  "motionPreset": "particles",
  "motionColour": "#7fd1a8",
  "panelsTranslucent": true,
  "motionPaused": false
}
```

`motionPreset` is `z.enum(MOTION_PRESET_IDS)`; `motionColour` is `z.string().regex(/^#[0-9a-fA-F]{6}$/)`, returned lowercase.

## `PATCH /me` (`PatchMeRequest`)

All four are optional; any subset may be sent with the existing fields.

| Field | Accepts | Rejects with |
|---|---|---|
| `motionPreset` | one of the five ids | 400 `validation_error` |
| `motionColour` | `#rrggbb`, any case | 400 `validation_error` |
| `panelsTranslucent` | boolean | 400 `validation_error` |
| `motionPaused` | boolean | 400 `validation_error` |

Unauthenticated: 401 `unauthenticated`. CSRF rules unchanged. The ownership matrix already covers `PATCH /me`; its user A × user B case asserts B's appearance is untouched after A patches.

## `GET /flags/public` (new, unauthenticated)

```json
{ "flags": { "appearance.motion": false } }
```

Returns only the allowlist (`appearance.motion`), resolved globally with no user overrides, and never any other flag. `Cache-Control: max-age=60`.

## `flags` seed

`{ key: 'appearance.motion', description: 'Background motion, motion colour, panel and pause controls' }`, off.
