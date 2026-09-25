import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './categories.js';

// CLAUDE.md "Default category seed": 18 named categories; the 7 listed ones default to
// 'fixed'; 'Other' has no default kind (null); everything else defaults to 'variable'.
describe('DEFAULT_CATEGORIES', () => {
  it('has the 18 categories from CLAUDE.md, in order', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual([
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
    ]);
  });

  it('marks the documented fixed-kind defaults as fixed', () => {
    const fixed = new Set([
      'Rent',
      'Council tax',
      'Utilities',
      'Internet',
      'Phone',
      'Subscriptions',
      'Gym & health',
    ]);
    for (const c of DEFAULT_CATEGORIES) {
      if (fixed.has(c.name)) expect(c.defaultKind).toBe('fixed');
    }
  });

  it('gives "Other" no default kind', () => {
    const other = DEFAULT_CATEGORIES.find((c) => c.name === 'Other');
    expect(other?.defaultKind).toBeNull();
  });

  it('defaults every other category to variable', () => {
    for (const c of DEFAULT_CATEGORIES) {
      if (c.name === 'Other') continue;
      const isFixed = [
        'Rent',
        'Council tax',
        'Utilities',
        'Internet',
        'Phone',
        'Subscriptions',
        'Gym & health',
      ].includes(c.name);
      if (!isFixed) expect(c.defaultKind).toBe('variable');
    }
  });
});
