import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categories, expenses } from '@desk/db';
import { startHarness, type ApiClient, type Harness } from './harness.js';

describe('insights routes (US8)', () => {
  let harness: Harness;
  let userA: ApiClient & { userId: string };

  beforeAll(async () => {
    harness = await startHarness();
    userA = await harness.asUser('insights-a@example.com');
    harness.clock.set(new Date('2026-09-15T00:00:00Z'));
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function seedCategory(
    userId: string,
    overrides: Partial<typeof categories.$inferInsert> = {},
  ) {
    const [row] = await harness.db
      .insert(categories)
      .values({
        userId,
        name: `Rent ${crypto.randomUUID()}`,
        colour: '#000000',
        budgetMinor: 100_000,
        defaultKind: 'fixed',
        ...overrides,
      })
      .returning();
    return row!;
  }

  async function seedExpense(
    userId: string,
    categoryId: string,
    date: string,
    amountDefault: number,
    kind: 'fixed' | 'variable' | 'one_off' = 'fixed',
  ) {
    await harness.db.insert(expenses).values({
      id: crypto.randomUUID(),
      userId,
      categoryId,
      description: 'seed',
      expenseDate: date,
      paidWith: 'card',
      kind,
      amountOriginal: amountDefault,
      currencyOriginal: 'GBP',
      rateToDefault: '1',
      rateDate: date,
      rateSource: 'none',
      amountDefault,
      addedVia: 'dashboard',
    });
  }

  it('GET /summary/category/:id returns that category spend over months and 404s for another user', async () => {
    const cat = await seedCategory(userA.userId);
    await seedExpense(userA.userId, cat.id, '2026-09-05', 5_000);

    const res = await userA.get(`/summary/category/${cat.id}?months=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categoryId: string; months: { spent: number }[] };
    expect(body.categoryId).toBe(cat.id);
    expect(body.months[0]?.spent).toBe(5_000);

    const userB = await harness.asUser('insights-b@example.com');
    const otherRes = await userB.get(`/summary/category/${cat.id}`);
    expect(otherRes.status).toBe(404);
    const json = (await otherRes.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('not_found');
  });

  it('GET /summary/forecast sums spend to date, remaining fixed budgets and variable run-rate', async () => {
    const forecastUser = await harness.asUser('insights-forecast@example.com');
    const fixed = await seedCategory(forecastUser.userId, {
      defaultKind: 'fixed',
      budgetMinor: 10_000,
    });
    const variable = await seedCategory(forecastUser.userId, {
      defaultKind: 'variable',
      budgetMinor: null,
    });
    await seedExpense(forecastUser.userId, fixed.id, '2026-09-01', 4_000, 'fixed');
    await seedExpense(forecastUser.userId, variable.id, '2026-09-05', 3_000, 'variable');

    const res = await forecastUser.get('/summary/forecast?month=2026-09');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      spentToDate: number;
      committedFixed: number;
      forecast: number;
      basis: string[];
    };
    expect(body.spentToDate).toBe(7_000);
    expect(body.committedFixed).toBe(6_000); // 10_000 budget - 4_000 already incurred
    expect(body.basis).toContain('spend to date');
    expect(body.basis).toContain('remaining fixed-kind budgets');
  });

  it('GET /summary/forecast names missing inputs when there are no fixed budgets or spend', async () => {
    const emptyUser = await harness.asUser('insights-empty@example.com');
    const res = await emptyUser.get('/summary/forecast?month=2020-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { basis: string[]; forecast: number };
    expect(body.basis).toContain('no spend yet');
    expect(body.forecast).toBe(0);
  });

  it('GET /summary/compare returns per-category deltas between two months', async () => {
    const cat = await seedCategory(userA.userId, { name: `Compare ${crypto.randomUUID()}` });
    await seedExpense(userA.userId, cat.id, '2026-09-10', 2_000);
    await seedExpense(userA.userId, cat.id, '2026-08-10', 1_000);

    const res = await userA.get('/summary/compare?a=2026-09&b=2026-08');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byCategory: { categoryId: string; a: number; b: number; delta: number }[];
    };
    const row = body.byCategory.find((c) => c.categoryId === cat.id);
    expect(row).toBeDefined();
    expect(row?.delta).toBe(1_000);
  });
});
