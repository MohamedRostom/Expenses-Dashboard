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
