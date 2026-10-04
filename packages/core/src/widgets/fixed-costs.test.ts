import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixedCosts } from './fixed-costs.js';

const catArb = fc.record({
  defaultKind: fc.constantFrom('fixed', 'variable', 'one-off'),
  budgetMinor: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: null }),
});
const amountArb = fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null });
const inputArb = fc.array(fc.tuple(catArb, amountArb, amountArb), { maxLength: 12 }).map((rows) => {
  const cats = rows.map(([c], i) => ({ id: `c${i}`, name: `Cat ${i}`, ...c }));
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  rows.forEach(([, a, b], i) => {
    if (a !== null) cur.set(`c${i}`, a);
    if (b !== null) prev.set(`c${i}`, b);
  });
  return { cats, cur, prev };
});

describe('fixedCosts', () => {
  it('lists exactly the fixed categories with no expense this month', () => {
    fc.assert(
      fc.property(inputArb, ({ cats, cur, prev }) => {
        const r = fixedCosts(cats, cur, prev);
        const want = cats
          .filter((c) => c.defaultKind === 'fixed' && !cur.has(c.id))
          .map((c) => c.id);
        expect(r.remaining.map((x) => x.categoryId)).toEqual(want);
        expect(r.allRecorded).toBe(want.length === 0);
        const fixedIds = cats.filter((c) => c.defaultKind === 'fixed').map((c) => c.id);
        expect(r.recordedMinor).toBe(fixedIds.reduce((s, id) => s + (cur.get(id) ?? 0), 0));
      }),
    );
  });

  it('usual is budget, else previous month, else none; total sums the known ones', () => {
    fc.assert(
      fc.property(inputArb, ({ cats, cur, prev }) => {
        const r = fixedCosts(cats, cur, prev);
        for (const row of r.remaining) {
          const c = cats.find((x) => x.id === row.categoryId)!;
          expect(row.name).toBe(c.name);
          if (c.budgetMinor !== null) {
            expect(row).toMatchObject({ usualMinor: c.budgetMinor, usualBasis: 'budget' });
          } else if (prev.has(c.id)) {
            expect(row).toMatchObject({ usualMinor: prev.get(c.id), usualBasis: 'previous' });
          } else {
            expect(row).toMatchObject({ usualMinor: null, usualBasis: 'none' });
          }
        }
        expect(r.totalExpectedMinor).toBe(r.remaining.reduce((s, x) => s + (x.usualMinor ?? 0), 0));
      }),
    );
  });

  it('empty input', () => {
    expect(fixedCosts([], new Map(), new Map())).toEqual({
      remaining: [],
      totalExpectedMinor: 0,
      allRecorded: true,
      recordedMinor: 0,
    });
  });
});
