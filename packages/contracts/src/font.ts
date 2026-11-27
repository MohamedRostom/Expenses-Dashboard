/** Page font presets: installed system fonts only, nothing downloaded. The CHECK in
 * packages/db/migrations/0015_user_font.sql must list exactly these ids; the default is 'system'. */
export const FONT_IDS = ['system', 'serif', 'rounded', 'humanist'] as const;
export type FontId = (typeof FONT_IDS)[number];
