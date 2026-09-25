/** Default category seed (CLAUDE.md "Default category seed"), sort order = list order. */
export interface DefaultCategory {
  name: string;
  defaultKind: 'fixed' | 'variable' | null;
}

const FIXED = new Set([
  'Rent',
  'Council tax',
  'Utilities',
  'Internet',
  'Phone',
  'Subscriptions',
  'Gym & health',
]);

const NAMES = [
  'Rent',
  'Council tax',
  'Utilities',
  'Internet',
  'Phone',
  'Subscriptions',
  'Groceries',
  'Eating out',
  'Transport',
  'Cycling',
  'Gym & health',
  'Personal care',
  'Clothing',
  'Entertainment',
  'Household',
  'Driving lessons',
  'Travel',
  'Other',
];

export const DEFAULT_CATEGORIES: DefaultCategory[] = NAMES.map((name) => ({
  name,
  defaultKind: name === 'Other' ? null : FIXED.has(name) ? 'fixed' : 'variable',
}));

/** ponytail: fixed palette cycled by sort order — no colour picker needed for the seed. */
const SEED_COLOURS = [
  '#a83a2e',
  '#a8641a',
  '#8a7a1f',
  '#5c8a1f',
  '#1f6e5a',
  '#1f6e8a',
  '#1f4a8a',
  '#4a1f8a',
  '#7a1f8a',
  '#8a1f5c',
];

/** Seed colour for the category at sort position `i` (shared by sign-up and the db seed). */
export function seedColour(i: number): string {
  return SEED_COLOURS[i % SEED_COLOURS.length] as string;
}
