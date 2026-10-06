/** T027a: three months of catalogue data for the month switcher, August and October shaped like the
 * September data in fixtures.ts (which stays the source for September, byte for byte). Static. */
import { budgets, categoryNames, expenses, monthBudget, type FixtureExpense } from './fixtures.js';

export interface MonthBudgetRow {
  category: string;
  limit: number;
  spent: number;
}
export interface MonthData {
  key: string;
  label: string;
  short: string;
  /** Three-letter month for the row dates ("30 Sep"). */
  abbr: string;
  /** Last day of the month, for the add-expense default date. */
  days: number;
  /** Month budget, integer minor units. */
  budget: number;
  entries: FixtureExpense[];
  categories: MonthBudgetRow[];
  /** The foreign-currency entry with a pending rate belongs to September only. */
  hasPendingRate: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const gen = (key: string, count: number, seed: number): FixtureExpense[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${key}-${i + 1}`,
    date: `${key}-${pad(i + 1)}`,
    category: categoryNames[(i * 7 + seed) % categoryNames.length]!,
    amount: 380 + ((i * 1117 + seed * 211) % 8200),
    note: `Fixture expense ${i + 1}`,
  }));

export const months: MonthData[] = [
  {
    key: '2026-08',
    label: 'August 2026',
    short: 'Aug 2026',
    abbr: 'Aug',
    days: 31,
    budget: 210000,
    entries: gen('2026-08', 31, 3),
    categories: [
      { category: 'Groceries', limit: 40000, spent: 31200 },
      { category: 'Eating out', limit: 15000, spent: 12800 },
      { category: 'Transport', limit: 12000, spent: 13400 }, // over budget
    ],
    hasPendingRate: false,
  },
  {
    key: '2026-09',
    label: 'September 2026',
    short: 'Sep 2026',
    abbr: 'Sep',
    days: 30,
    budget: monthBudget,
    entries: expenses,
    categories: budgets.map((b) => ({ ...b })),
    hasPendingRate: true,
  },
  {
    key: '2026-10',
    label: 'October 2026',
    short: 'Oct 2026',
    abbr: 'Oct',
    days: 31,
    budget: 220000,
    entries: gen('2026-10', 6, 5),
    categories: [
      { category: 'Groceries', limit: 40000, spent: 6400 },
      { category: 'Eating out', limit: 15000, spent: 2100 },
      { category: 'Transport', limit: 12000, spent: 1800 },
    ],
    hasPendingRate: false,
  },
];
