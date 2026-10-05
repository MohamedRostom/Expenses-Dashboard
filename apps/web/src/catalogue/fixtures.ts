/** Synthetic catalogue data (specs/004-web-ui-refresh/data-model.md §Catalogue fixtures).
 * Static on purpose: nothing under catalogue/ imports a store or the API client. */
export const user = {
  default_currency: 'GBP',
  time_zone: 'Europe/London',
  theme: 'system',
} as const;

export const categoryNames = [
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
] as const;

/** 48 characters exactly. */
export const longCategoryName = 'Annual professional membership and training fees';

export interface FixtureExpense {
  id: string;
  date: string;
  category: string;
  /** Integer minor units (pence). */
  amount: number;
  note: string;
}

const month = '2026-09';
// One entry per day for 30 days, cycling through the categories; amounts are deterministic.
export const expenses: FixtureExpense[] = Array.from({ length: 30 }, (_, i) => ({
  id: `exp-${i + 1}`,
  date: `${month}-${String(i + 1).padStart(2, '0')}`,
  category: categoryNames[(i * 5) % categoryNames.length]!,
  amount: 450 + ((i * 1373) % 9000),
  note: `Fixture expense ${i + 1}`,
}));

export const budgets = [
  { category: 'Groceries', limit: 40000, spent: 25000 },
  { category: 'Eating out', limit: 15000, spent: 21000 }, // over budget
  { category: 'Transport', limit: 12000, spent: 8000 },
] as const;

/** Error codes a panel can show (ErrorState copy branches on these). */
export const panelErrorCauses = [
  'validation_failed',
  'unauthenticated',
  'not_found',
  'rate_limited',
  'conflict',
  'rate_unavailable',
  'offline',
  'server_error',
] as const;

export const edge = {
  longCategory: { id: 'cat-long', name: longCategoryName, spent: 12500, budget: null },
  /** £123,456.78 as minor units: six digits before the decimal point. */
  largeAmount: 12345678,
  busyDay: Array.from({ length: 30 }, (_, i) => ({
    id: `busy-${i + 1}`,
    date: `${month}-15`,
    category: categoryNames[i % categoryNames.length]!,
    amount: 300 + i * 125,
    note: `Busy day entry ${i + 1}`,
  })) satisfies FixtureExpense[],
};

/** T027 mock-ups: the month's overall budget, in minor units (£2,200.00). */
export const monthBudget = 220000;

/** T027 mock-ups: one foreign-currency entry whose rate is still pending, for the arrival flip.
 * `amountDefault` is what it converts to once the rate arrives. */
export const pendingRateEntry = {
  id: 'exp-pending',
  date: `${month}-30`,
  category: 'Transport',
  note: 'Airport train',
  amountOriginal: 5200,
  currencyOriginal: 'USD',
  rate: 0.7462,
  amountDefault: 3880,
} as const;
