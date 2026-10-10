/** User-selectable accent presets (spec 004 US5). The CHECK in
 * packages/db/migrations/0011_user_accent.sql must list exactly these ids. */
export const ACCENT_IDS = [
  'signal-green',
  'concourse-blue',
  'platform-teal',
  'violet',
  'slate',
  'plum',
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
