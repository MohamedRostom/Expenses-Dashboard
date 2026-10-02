/** The fixed eight-colour connected-account palette (FR-004). Ids match the server's
 * COLOUR_PALETTE (apps/api/src/services/connections.ts) and the `--palette-<id>` tokens in
 * tokens.css; `name` is the accessible label the colour radio group (FR-024) reads out. */
export const PALETTE_COLOURS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'teal', name: 'Teal' },
  { id: 'blue', name: 'Blue' },
  { id: 'violet', name: 'Violet' },
  { id: 'pink', name: 'Pink' },
  { id: 'orange', name: 'Orange' },
  { id: 'amber', name: 'Amber' },
  { id: 'green', name: 'Green' },
  { id: 'slate', name: 'Slate' },
];
