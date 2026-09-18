import { describe, expect, it } from 'vitest';
import { compareMonths, type MonthSummaryLike } from './compare.js';

function month(spent: number, byCategory: { id: string; spent: number }[]): MonthSummaryLike {
  return { spent, byCategory };
}

describe('compareMonths', () => {
  it('computes total and percent delta between two months', () => {
    const current = month(12_000, [{ id: 'food', spent: 7_000 }]);
    const previous = month(10_000, [{ id: 'food', spent: 5_000 }]);
    const result = compareMonths(current, previous);
    expect(result.deltaTotal).toBe(2_000);
    expect(result.deltaPercent).toBeCloseTo(20);
    expect(result.byCategory).toEqual([{ id: 'food', deltaMinor: 2_000 }]);
  });

  it('returns a null percent delta when the previous month total is 0', () => {
    const current = month(5_000, []);
    const previous = month(0, []);
    const result = compareMonths(current, previous);
    expect(result.deltaTotal).toBe(5_000);
    expect(result.deltaPercent).toBeNull();
  });

  it('includes categories present in only one of the two months', () => {
    const current = month(1_000, [{ id: 'a', spent: 1_000 }]);
    const previous = month(500, [{ id: 'b', spent: 500 }]);
    const result = compareMonths(current, previous);
    const byId = Object.fromEntries(result.byCategory.map((c) => [c.id, c.deltaMinor]));
    expect(byId.a).toBe(1_000);
    expect(byId.b).toBe(-500);
  });
});
