import { type CategoryRow, type ExpenseRow, monthSummary } from './month-summary.js';

export interface MonthTotal {
  month: string;
  spent: number;
  budgeted: number;
}

export interface YearSummaryResult {
  year: number;
  months: MonthTotal[];
}

/** Composes monthSummary over the 12 months of `year` ('YYYY'); year total is the sum of the
 * months, so it inherits the same pending/binned exclusions. */
export function yearSummary(
  expenses: ExpenseRow[],
  categories: CategoryRow[],
  year: string,
): YearSummaryResult {
  const months: MonthTotal[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    const { tiles } = monthSummary(expenses, categories, month);
    months.push({ month, spent: tiles.spent, budgeted: tiles.budget });
  }
  const year_ = months.reduce((acc, m) => acc + m.spent, 0);
  return { year: year_, months };
}
