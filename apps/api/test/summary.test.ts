import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categories, expenses } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

describe('summary routes', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function seed(userId: string) {
    const [rent] = await harness.db
      .insert(categories)
      .values({ userId, name: 'Rent', colour: '#000000', budgetMinor: 100000 })
      .returning();
    const [food] = await harness.db
      .insert(categories)
      .values({ userId, name: 'Food', colour: '#111111', budgetMinor: null })
      .returning();

    await harness.db.insert(expenses).values([
      {
        id: crypto.randomUUID(),
        userId,
        categoryId: rent!.id,
        description: 'September rent',
        expenseDate: '2026-09-01',
        paidWith: 'bank_transfer',
        kind: 'fixed',
        amountOriginal: 120000,
        currencyOriginal: 'GBP',
        rateToDefault: '1',
        rateDate: '2026-09-01',
        rateSource: 'none',
        amountDefault: 120000,
        addedVia: 'dashboard',
      },
      {
        id: crypto.randomUUID(),
        userId,
        categoryId: food!.id,
        description: 'Groceries',
        expenseDate: '2026-09-05',
        paidWith: 'card',
        kind: 'variable',
        amountOriginal: 5000,
        currencyOriginal: 'GBP',
        rateToDefault: '1',
        rateDate: '2026-09-05',
        rateSource: 'none',
        amountDefault: 5000,
        addedVia: 'dashboard',
      },
      // pending rate: amountDefault null, should count toward pendingCount not spent
      {
        id: crypto.randomUUID(),
        userId,
        categoryId: food!.id,
        description: 'Pending import',
        expenseDate: '2026-09-10',
        paidWith: 'card',
        kind: 'variable',
        amountOriginal: 2000,
        currencyOriginal: 'USD',
        addedVia: 'dashboard',
      },
      // different month, should not count in Sept
      {
        id: crypto.randomUUID(),
        userId,
        categoryId: rent!.id,
        description: 'October rent',
        expenseDate: '2026-10-01',
        paidWith: 'bank_transfer',
        kind: 'fixed',
        amountOriginal: 120000,
        currencyOriginal: 'GBP',
        rateToDefault: '1',
        rateDate: '2026-10-01',
        rateSource: 'none',
        amountDefault: 120000,
        addedVia: 'dashboard',
      },
    ]);

    return { rent: rent!, food: food! };
  }

  it('GET /summary/month returns tiles, per-category over-budget, and pending count', async () => {
    const user = await harness.asUser('summary-month@test.dev');
    const { rent, food } = await seed(user.userId);

    const res = await user.get('/summary/month?month=2026-09');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      month: string;
      spent: number;
      budgeted: number;
      remaining: number;
      pendingRates: number;
      byCategory: {
        categoryId: string;
        spent: number;
        budget: number | null;
        overBudget: boolean;
      }[];
    };

    expect(body.month).toBe('2026-09');
    expect(body.spent).toBe(125000);
    expect(body.budgeted).toBe(100000);
    expect(body.remaining).toBe(-25000);
    expect(body.pendingRates).toBe(1);

    const rentSpend = body.byCategory.find((c: { categoryId: string }) => c.categoryId === rent.id);
    expect(rentSpend).toMatchObject({ spent: 120000, budget: 100000, overBudget: true });

    const foodSpend = body.byCategory.find((c: { categoryId: string }) => c.categoryId === food.id);
    expect(foodSpend).toMatchObject({ spent: 5000, budget: null, overBudget: false });
  });

  it('GET /summary/year groups months and totals the year', async () => {
    const user = await harness.asUser('summary-year@test.dev');
    await seed(user.userId);

    const res = await user.get('/summary/year?year=2026');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      year: string;
      months: { month: string; spent: number; budgeted: number }[];
    };

    expect(body.year).toBe('2026');
    expect(body.months).toHaveLength(12);
    const sept = body.months.find((m: { month: string }) => m.month === '2026-09');
    const oct = body.months.find((m: { month: string }) => m.month === '2026-10');
    expect(sept).toMatchObject({ month: '2026-09', spent: 125000, budgeted: 100000 });
    expect(oct).toMatchObject({ month: '2026-10', spent: 120000, budgeted: 100000 });
  });

  it('GET /summary/month requires auth', async () => {
    const res = await harness.app.request('/summary/month?month=2026-09');
    expect(res.status).toBe(401);
  });

  it('GET /rates returns a rate preview for a supported pair', async () => {
    const user = await harness.asUser('rates-preview@test.dev');
    const res = await user.get('/rates?date=2026-09-18&from=GBP&to=EUR');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('rate');
    expect(body).toHaveProperty('rateDate');
    expect(body).toHaveProperty('source');
  });

  it('GET /rates same-currency short-circuits to rate 1', async () => {
    const user = await harness.asUser('rates-same@test.dev');
    const res = await user.get('/rates?date=2026-09-18&from=GBP&to=GBP');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rate: string };
    expect(body.rate).toBe('1');
  });

  it('GET /rates requires auth', async () => {
    const res = await harness.app.request('/rates?date=2026-09-18&from=GBP&to=USD');
    expect(res.status).toBe(401);
  });
});
