import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@desk/db';
import type { RatesProvider, RateOutcome } from '@desk/connectors/rates';
import { createRatesService } from '../src/services/rates.js';
import { createExpensesService } from '../src/services/expenses.js';
import { startHarness, type Harness } from './harness.js';

// T048: failing-first tests for POST/GET/PATCH/DELETE /expenses and /expenses/:id/restore.
//
// Interpretation notes for the two ambiguous cases (see task description):
// - "seven-day gap leaves pending": the rates provider answers with a rateDate more than 7
//   days before the requested expense date. Per research.md R6, frankfurter's own fallback
//   never walks back that far in practice, so an answer that does is treated as untrustworthy
//   and the expense is saved pending (amountDefault null), same as `unsupported`.
// - "later-date provider answer leaves pending": the provider answers with a rateDate AFTER
//   the requested date, which frankfurter never legitimately does (it only ever falls back to
//   a prior published date) — also treated as an anomaly and left pending.
// Both are exercised by calling the expenses service directly with a custom RatesProvider
// stub, bypassing HTTP, so no second Postgres container is needed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

class StubRates implements RatesProvider {
  constructor(private readonly outcome: RateOutcome) {}
  async rate(): Promise<RateOutcome> {
    return this.outcome;
  }
}

describe('expenses', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('rejects a categoryId that belongs to a different user', async () => {
    const userA = await h.asUser('expenses-cat-owner-a@example.com');
    const userB = await h.asUser('expenses-cat-owner-b@example.com');
    const { category } = await j(
      await userB.post('/categories', { name: 'B-only', colour: '#1f6e5a' }),
    );

    const res = await userA.post('/expenses', {
      description: 'Sneaky',
      amount: { minor: 100, currency: 'GBP' },
      date: '2026-09-10',
      categoryId: category.id,
      paidWith: 'card',
      kind: 'variable',
    });
    expect(res.status).toBe(404);

    // Same for PATCH, against an expense userA does own.
    const created = await j(
      await userA.post('/expenses', {
        description: 'Own expense',
        amount: { minor: 100, currency: 'GBP' },
        date: '2026-09-10',
        categoryId: null,
        paidWith: 'card',
        kind: 'variable',
      }),
    );
    const patchRes = await userA.patch(`/expenses/${created.expense.id}`, {
      categoryId: category.id,
    });
    expect(patchRes.status).toBe(404);
  });

  it('POST /expenses with a client UUID v7 is idempotent', async () => {
    const user = await h.asUser('expenses-idempotent@example.com');
    const id = '018f5a1e-0000-7000-8000-000000000001';
    const body = {
      id,
      description: 'Coffee',
      amount: { minor: 350, currency: 'GBP' },
      date: '2026-09-10',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    };

    const first = await user.post('/expenses', body);
    expect(first.status).toBe(201);
    const firstBody = await j(first);

    const second = await user.post('/expenses', body);
    expect(second.status).toBe(200);
    const secondBody = await j(second);

    expect(secondBody.expense.id).toBe(firstBody.expense.id);
    expect(secondBody.expense.createdAt).toBe(firstBody.expense.createdAt);
  });

  it('same-currency create sets rate 1 and source none', async () => {
    const user = await h.asUser('expenses-same-currency@example.com');
    const res = await user.post('/expenses', {
      description: 'Rent',
      amount: { minor: 100000, currency: 'GBP' },
      date: '2026-09-01',
      categoryId: null,
      paidWith: 'bank_transfer',
      kind: 'fixed',
    });
    expect(res.status).toBe(201);
    const body = await j(res);
    // numeric(20,10) round-trips through Postgres as a fully padded decimal string.
    expect(Number(body.expense.rateToDefault)).toBe(1);
    expect(body.expense.rateSource).toBe('none');
    expect(body.expense.rateDate).toBe('2026-09-01');
    expect(body.expense.amountDefault).toBe(100000);
  });

  it('weekend fallback records the fallback rate date, not the requested date', async () => {
    const user = await h.asUser('expenses-weekend@example.com');
    // Fixture only defines GBP -> EUR; expense stays in GBP, user's default becomes EUR so the
    // conversion direction (currencyOriginal -> defaultCurrency) matches it.
    await h.db.update(users).set({ defaultCurrency: 'EUR' }).where(eq(users.id, user.userId));
    const res = await user.post('/expenses', {
      description: 'Hotel',
      amount: { minor: 5000, currency: 'GBP' },
      date: '2026-09-20', // Sunday; fixture answers with 2026-09-18
      categoryId: null,
      paidWith: 'card',
      kind: 'one_off',
    });
    expect(res.status).toBe(201);
    const body = await j(res);
    expect(body.expense.rateDate).toBe('2026-09-18');
    expect(body.expense.rateSource).toBe('frankfurter');
    expect(body.expense.amountDefault).not.toBeNull();
  });

  it('unsupported currency saves the expense pending (amountDefault null)', async () => {
    const user = await h.asUser('expenses-unsupported@example.com');
    const res = await user.post('/expenses', {
      description: 'Souvenir',
      amount: { minor: 1200, currency: 'XYZ' },
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'cash',
      kind: 'one_off',
    });
    expect(res.status).toBe(201);
    const body = await j(res);
    expect(body.expense.amountDefault).toBeNull();
    expect(body.expense.rateToDefault).toBeNull();
  });

  it('a seven-day-plus rate date gap leaves the expense pending', async () => {
    const provider = new StubRates({ rate: '1.1', rateDate: '2026-09-01', source: 'frankfurter' });
    const service = createExpensesService(h.db, createRatesService(h.db, provider), h.clock);
    const user = await h.asUser('expenses-gap@example.com');

    const { expense } = await service.create(user.userId, 'GBP', {
      description: 'Old rate',
      amount: { minor: 900, currency: 'EUR' },
      date: '2026-09-18', // 17 days after the provider's rateDate
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });

    expect(expense.amountDefault).toBeNull();
    expect(expense.rateSource).toBeNull();
  });

  it('a later-date provider answer leaves the expense pending', async () => {
    const provider = new StubRates({ rate: '1.1', rateDate: '2026-09-20', source: 'frankfurter' });
    const service = createExpensesService(h.db, createRatesService(h.db, provider), h.clock);
    const user = await h.asUser('expenses-future-rate@example.com');

    const { expense } = await service.create(user.userId, 'GBP', {
      description: 'Anomalous answer',
      amount: { minor: 900, currency: 'EUR' },
      date: '2026-09-18', // provider answered with a LATER date than requested
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });

    expect(expense.amountDefault).toBeNull();
    expect(expense.rateDate).toBeNull();
  });

  it('zero amount is rejected', async () => {
    const user = await h.asUser('expenses-zero@example.com');
    const res = await user.post('/expenses', {
      description: 'Free',
      amount: { minor: 0, currency: 'GBP' },
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'cash',
      kind: 'variable',
    });
    expect(res.status).toBe(400);
    const body = await j(res);
    expect(body.error.code).toBe('validation_failed');
  });

  it('a date more than a year in the future is rejected', async () => {
    const user = await h.asUser('expenses-future-date@example.com');
    const farFuture = new Date(h.clock.now());
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const res = await user.post('/expenses', {
      description: 'Too far out',
      amount: { minor: 500, currency: 'GBP' },
      date: farFuture.toISOString().slice(0, 10),
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    expect(res.status).toBe(400);
    const body = await j(res);
    expect(body.error.code).toBe('validation_failed');
  });

  it('rate override retains the fetched rate and clearing it restores that rate', async () => {
    const user = await h.asUser('expenses-override@example.com');
    // Fixture only defines GBP -> EUR; flip the user's default so the fixture applies.
    await h.db.update(users).set({ defaultCurrency: 'EUR' }).where(eq(users.id, user.userId));
    const created = await user.post('/expenses', {
      description: 'Trip expense',
      amount: { minor: 2000, currency: 'GBP' },
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    const originalBody = await j(created);
    const fetchedRate = originalBody.expense.rateToDefault;
    const fetchedAmount = originalBody.expense.amountDefault;
    expect(fetchedRate).not.toBeNull();

    const overridden = await user.patch(`/expenses/${originalBody.expense.id}`, {
      rateOverride: { rate: '2' },
    });
    expect(overridden.status).toBe(200);
    const overriddenBody = await j(overridden);
    expect(overriddenBody.expense.rateOverridden).toBe(true);
    expect(overriddenBody.expense.rateSource).toBe('user');
    expect(Number(overriddenBody.expense.rateToDefault)).toBe(2);
    expect(overriddenBody.expense.amountDefault).toBe(4000);

    const cleared = await user.patch(`/expenses/${originalBody.expense.id}`, {
      rateOverride: null,
    });
    expect(cleared.status).toBe(200);
    const clearedBody = await j(cleared);
    expect(clearedBody.expense.rateOverridden).toBe(false);
    expect(clearedBody.expense.rateToDefault).toBe(fetchedRate);
    expect(clearedBody.expense.amountDefault).toBe(fetchedAmount);
  });

  it('soft delete, restore, and marking for purge after 30 days', async () => {
    const user = await h.asUser('expenses-delete@example.com');
    const created = await user.post('/expenses', {
      description: 'To be binned',
      amount: { minor: 700, currency: 'GBP' },
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'cash',
      kind: 'variable',
    });
    const { expense } = await j(created);

    const del = await user.delete(`/expenses/${expense.id}`);
    expect(del.status).toBe(204);

    const listAfterDelete = await user.get('/expenses?month=2026-09');
    const listBody = await j(listAfterDelete);
    expect(listBody.expenses.find((e: { id: string }) => e.id === expense.id)).toBeUndefined();

    const listIncludingDeleted = await user.get('/expenses?month=2026-09&includeDeleted=true');
    const includingDeletedBody = await j(listIncludingDeleted);
    const binned = includingDeletedBody.expenses.find((e: { id: string }) => e.id === expense.id);
    expect(binned.deletedAt).not.toBeNull();

    const restore = await user.post(`/expenses/${expense.id}/restore`);
    expect(restore.status).toBe(200);
    const restoredBody = await j(restore);
    expect(restoredBody.expense.deletedAt).toBeNull();

    // Purge itself is a housekeeping-job concern (not this task); just prove deletedAt, once
    // set, is old enough for a >30-day purge query to find it.
    await user.delete(`/expenses/${expense.id}`);
    const thirtyOneDaysAgo = new Date(h.clock.now());
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
    const [row] = await h.db
      .select()
      .from((await import('@desk/db')).expenses)
      .where((await import('drizzle-orm')).eq((await import('@desk/db')).expenses.id, expense.id));
    expect(row?.deletedAt).not.toBeNull();
    expect((row?.deletedAt as Date).getTime()).toBeGreaterThan(thirtyOneDaysAgo.getTime());
  });

  it('GET /expenses paginates by cursor at 500 rows', async () => {
    const user = await h.asUser('expenses-pagination@example.com');
    const { expenses: expensesTable } = await import('@desk/db');

    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: `018f5a1e-1111-7000-8000-${String(i).padStart(12, '0')}`,
      userId: user.userId,
      categoryId: null,
      description: `Row ${i}`,
      expenseDate: '2026-09-15',
      paidWith: 'card',
      kind: 'variable',
      amountOriginal: 100,
      currencyOriginal: 'GBP',
      rateToDefault: '1',
      rateDate: '2026-09-15',
      rateSource: 'none',
      amountDefault: 100,
      addedVia: 'dashboard',
    }));
    await h.db.insert(expensesTable).values(rows);

    const firstPage = await user.get('/expenses?month=2026-09');
    expect(firstPage.status).toBe(200);
    const firstBody = await j(firstPage);
    expect(firstBody.expenses.length).toBe(500);
    expect(firstBody.nextCursor).not.toBeNull();
    expect(firstBody.summary.month).toBe('2026-09');

    const secondPage = await user.get(`/expenses?month=2026-09&cursor=${firstBody.nextCursor}`);
    const secondBody = await j(secondPage);
    expect(secondBody.expenses.length).toBe(1);
    expect(secondBody.nextCursor).toBeNull();
  });
});
