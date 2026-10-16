/** Background motion presets (spec 006). The CHECK in packages/db/migrations/0012_user_motion.sql
 * must list exactly these ids; the default is 'particles'. */
export const MOTION_PRESET_IDS = ['none', 'aurora', 'grid', 'particles', 'grain'] as const;
export type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];

export const MOTION_SWATCHES = [
  { id: 'signal-mint', hex: '#7fd1a8' },
  { id: 'platform-blue', hex: '#8fb3ff' },
  { id: 'lamp-amber', hex: '#f5c27a' },
  { id: 'dusk-violet', hex: '#c9a7ff' },
  { id: 'coral', hex: '#ff9fb2' },
  { id: 'silver', hex: '#e9edf2' },
] as const;

/** Tint used in dark theme whatever the saved colour. */
export const MOTION_DARK_TINT = '#7fd1a8';
