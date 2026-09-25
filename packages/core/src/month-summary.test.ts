import { describe, expect, it } from 'vitest';
import { monthSummary, type CategoryRow, type ExpenseRow } from './month-summary.js';
import { yearSummary } from './year-summary.js';

const cats: CategoryRow[] = [
  { id: 'food', budgetMinor: 10_000 },
  { id: 'misc', budgetMinor: null },
];

function exp(
  partial: Partial<ExpenseRow> & Pick<ExpenseRow, 'categoryId' | 'expenseDate'>,
): ExpenseRow {
  return {
    amountDefault: 1_000,
    deletedAt: null,
    ...partial,
  };
}

describe('monthSummary', () => {
  it('excludes binned (deleted) rows from totals', () => {
    const rows = [
      exp({ categoryId: 'food', expenseDate: '2026-09-01', amountDefault: 1_000 }),
      exp({
        categoryId: 'food',
        expenseDate: '2026-09-02',
        amountDefault: 5_000,
        deletedAt: '2026-09-03T00:00:00Z',
      }),
    ];
    const result = monthSummary(rows, cats, '2026-09');
    expect(result.tiles.spent).toBe(1_000);
  });

  it('excludes pending rows (amountDefault null) from totals', () => {
    const rows = [
      exp({ categoryId: 'food', expenseDate: '2026-09-01', amountDefault: 1_000 }),
      exp({ categoryId: 'food', expenseDate: '2026-09-02', amountDefault: null }),
    ];
    const result = monthSummary(rows, cats, '2026-09');
    expect(result.tiles.spent).toBe(1_000);
    expect(result.pendingCount).toBe(1);
  });

  it('remaining may be negative when spend exceeds budget', () => {
    const rows = [exp({ categoryId: 'food', expenseDate: '2026-09-01', amountDefault: 15_000 })];
    const result = monthSummary(rows, cats, '2026-09');
    expect(result.tiles.remaining).toBe(10_000 - 15_000);
    expect(result.tiles.remaining).toBeLessThan(0);
  });

  it('categories without a budget still count in spent, with budget null and no over-budget flag', () => {
    const rows = [exp({ categoryId: 'misc', expenseDate: '2026-09-01', amountDefault: 2_000 })];
    const result = monthSummary(rows, cats, '2026-09');
    expect(result.tiles.spent).toBe(2_000);
    const miscEntry = result.categories.find((c) => c.id === 'misc');
    expect(miscEntry?.budget).toBeNull();
    expect(miscEntry?.overBudget).toBe(false);
  });

  it('ignores rows outside the requested month', () => {
    const rows = [exp({ categoryId: 'food', expenseDate: '2026-08-15', amountDefault: 1_000 })];
    const result = monthSummary(rows, cats, '2026-09');
    expect(result.tiles.spent).toBe(0);
  });
});

describe('yearSummary', () => {
  it('year total equals the sum of its months', () => {
    const rows: ExpenseRow[] = [
      exp({ categoryId: 'food', expenseDate: '2026-01-05', amountDefault: 1_000 }),
      exp({ categoryId: 'food', expenseDate: '2026-02-05', amountDefault: 2_000 }),
      exp({ categoryId: 'food', expenseDate: '2026-03-05', amountDefault: 3_000 }),
      // pending and binned rows must not leak into the year total either
      exp({ categoryId: 'food', expenseDate: '2026-04-05', amountDefault: null }),
      exp({
        categoryId: 'food',
        expenseDate: '2026-05-05',
        amountDefault: 9_000,
        deletedAt: '2026-05-06T00:00:00Z',
      }),
    ];
    const result = yearSummary(rows, cats, '2026');
    const summedMonths = result.months.reduce((acc, m) => acc + m.spent, 0);
    expect(result.year).toBe(summedMonths);
    expect(result.year).toBe(6_000);
  });
});
