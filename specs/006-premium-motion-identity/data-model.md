# Data Model: Premium Identity with Background Motion

## users (four new columns, migration `0012_user_motion.sql`)

| Column | Type | Default | Rule |
|---|---|---|---|
| `motion_preset` | text NOT NULL | `'particles'` | CHECK in `('none','aurora','grid','particles','grain')`; must equal `MOTION_PRESET_IDS` in `packages/contracts/src/motion.ts` |
| `motion_colour` | text NOT NULL | `'#7fd1a8'` | CHECK `motion_colour ~ '^#[0-9a-f]{6}$'`; the API lowercases before writing |
| `panels_translucent` | boolean NOT NULL | `true` | none |
| `motion_paused` | boolean NOT NULL | `false` | none |

Existing rows take the defaults on migration, so every current user starts on Particles, Signal mint, translucent, not paused. Each row belongs to its user; only `PATCH /me` writes these columns, for the caller's own row.

## Stored presets (code, read-only)

`packages/contracts/src/motion.ts`:

- `MOTION_PRESET_IDS = ['none', 'aurora', 'grid', 'particles', 'grain'] as const`, default `'particles'`.
- `MOTION_SWATCHES`: `signal-mint #7fd1a8` (default), `platform-blue #8fb3ff`, `lamp-amber #f5c27a`, `dusk-violet #c9a7ff`, `coral #ff9fb2`, `silver #e9edf2`.
- `MOTION_DARK_TINT = '#7fd1a8'` (Signal mint, drawn at the dark alpha from research R4).

Labels and descriptions shown in Settings live in the web app next to the picker, not in contracts.

## Resolution rules (client)

The effective appearance on a screen is derived, never stored:

1. Flag off: still ground (`data-motion="none"`), translucent panels, whatever is saved.
2. Flag on, signed out: the defaults (Particles, Signal mint in light, the dark tint in dark, translucent, not paused).
3. Flag on, signed in: the user's preset; tint = `MOTION_DARK_TINT` in dark, else `motion_colour`; panels per `panels_translucent`.
4. Paused when `motion_paused`, the page is hidden, or the system asks for reduced motion or reduced data.
5. An unknown preset falls back to `particles` and an invalid colour to `#7fd1a8` (FR-016). The database CHECKs make this a guard for stale clients, not an expected path.
