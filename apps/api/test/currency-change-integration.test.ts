import { describe, it, expect } from 'vitest';
import {
  runCurrencyChange,
  categoriesRowSource,
  expensesRowSource,
  combinedRowSource,
} from '../src/jobs/currency-change.js';
import { createRatesService } from '../src/services/rates.js';
import { FakeRates } from '@desk/connectors/rates';
import { startHarness, type Harness } from './harness.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

// C2: proves currency.change re-derives both category budgets and expense amountDefault
// through the real Drizzle-backed RowSources, using the correct fromCurrency (not '' — the
// old bug read as EUR) and core's convert() (not float Math.round).
describe('currency.change against real RowSources', () => {
  it('re-derives a category budget and an expense amountDefault to the new default currency', async () => {
    const h: Harness = await startHarness(new FakeRates());
    try {
      const user = await h.asUser('currency-change-real@example.com');

      const { category } = await j(
        await user.post('/categories', { name: 'Rent', colour: '#1f6e5a' }),
      );
      await user.patch(`/categories/${category.id}`, { budgetMinor: 10000 });

      const expenseRes = await user.post('/expenses', {
        description: 'Weekly shop',
        date: '2026-09-18',
        categoryId: category.id,
        paidWith: 'card',
        kind: 'variable',
        amount: { minor: 5000, currency: 'GBP' },
      });
      expect(expenseRes.status).toBe(201);

      const source = combinedRowSource(categoriesRowSource(h.db), expensesRowSource(h.db));
      const getRate = createRatesService(h.db, new FakeRates()).getRate;
      await runCurrencyChange(
        { userId: user.userId, fromCurrency: 'GBP', toCurrency: 'EUR', changeDate: '2026-09-18' },
        source,
        getRate,
        { updateProgress: async () => {} },
      );

      const cat = await j(await user.get('/categories'));
      const rent = cat.categories.find((c: { id: string }) => c.id === category.id);
      // GBP->EUR 1.1532 (weekday fixture): 100.00 GBP -> 115.32 EUR
      expect(rent.budgetMinor).toBe(11532);

      const list = await j(await user.get('/expenses?month=2026-09'));
      const expense = list.expenses.find(
        (e: { description: string }) => e.description === 'Weekly shop',
      );
      // 50.00 GBP -> 57.66 EUR
      expect(expense.amountDefault).toBe(5766);
      expect(expense.amountOriginal).toBe(5000); // original amount/currency untouched
      expect(expense.currencyOriginal).toBe('GBP');
    } finally {
      await h.close();
    }
  });
});
