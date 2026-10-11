import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, seedColour } from './categories.js';

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

// Status Is Not a Series (DESIGN.md): no seeded colour may equal a status colour.
describe('seedColour', () => {
  it('never returns a status colour', () => {
    const status = ['#a83a2e', '#b00020', '#ff6b6b', '#8a5a00', '#ffb000', '#a8641a', '#8f5810'];
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) expect(status).not.toContain(seedColour(i));
  });

  it('keeps every seed colour outside the 0-60 degree status band (red, orange, amber)', () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    for (let i = 0; i < 10; i++) {
      const h = hue(seedColour(i));
      expect(h < 0 || h > 60 ? true : `${seedColour(i)} hue ${h}`).toBe(true);
    }
  });
});
