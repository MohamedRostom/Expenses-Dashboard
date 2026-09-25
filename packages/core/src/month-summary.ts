/** Minimal shape month-summary needs from an expense row — amounts in default-currency minor
 * units, already converted (amountDefault is null while a rate is pending, per data-model.md). */
export interface ExpenseRow {
  categoryId: string | null;
  expenseDate: string; // 'YYYY-MM-DD'
  amountDefault: number | null;
  deletedAt: string | null;
}

export interface CategoryRow {
  id: string;
  budgetMinor: number | null;
}

export interface CategorySummary {
  id: string;
  spent: number;
  budget: number | null;
  overBudget: boolean;
}

export interface MonthSummaryResult {
  tiles: { spent: number; budget: number; remaining: number };
  categories: CategorySummary[];
  pendingCount: number;
}

/** Pure month rollup: totals exclude binned (deletedAt set) and pending (amountDefault null)
 * rows. `remaining` (budget - spent) may go negative. Categories with no budget still count
 * toward spent; their own entry gets `budget: null` and `overBudget: false`. */
export function monthSummary(
  expenses: ExpenseRow[],
  categories: CategoryRow[],
  month: string,
): MonthSummaryResult {
  const spentByCategory = new Map<string, number>();
  let spent = 0;
  let pendingCount = 0;

  for (const row of expenses) {
    if (!row.expenseDate.startsWith(month)) continue;
    if (row.deletedAt !== null) continue;
    if (row.amountDefault === null) {
      pendingCount += 1;
      continue;
    }
    spent += row.amountDefault;
    if (row.categoryId !== null) {
      spentByCategory.set(
        row.categoryId,
        (spentByCategory.get(row.categoryId) ?? 0) + row.amountDefault,
      );
    }
  }

  const budget = categories.reduce((acc, c) => acc + (c.budgetMinor ?? 0), 0);

  const categorySummaries: CategorySummary[] = categories.map((c) => {
    const catSpent = spentByCategory.get(c.id) ?? 0;
    const catBudget = c.budgetMinor;
    return {
      id: c.id,
      spent: catSpent,
      budget: catBudget,
      overBudget: catBudget !== null && catSpent > catBudget,
    };
  });

  return {
    tiles: { spent, budget, remaining: budget - spent },
    categories: categorySummaries,
    pendingCount,
  };
}
