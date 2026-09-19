import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { categories as categoriesTable, expenses as expensesTable } from '@desk/db';
import { DEFAULT_CATEGORIES } from '@desk/core';
import { runCurrencyChange, categoriesRowSource } from '../src/jobs/currency-change.js';
import { startHarness, type Harness, type ApiClient } from './harness.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';

// T061: failing-first tests for /categories — seeding on sign-up, CRUD, archive, delete
// reassignment, "Other" protection, and budget conversion on currency change.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

describe('categories', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  const csrfHeaders = { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' };
  function withCsrf(cookies = ''): Record<string, string> {
    return {
      ...csrfHeaders,
      cookie: `__Host-desk_csrf=test-csrf-token${cookies ? '; ' + cookies : ''}`,
    };
  }

  /** Goes through the real register()->verify() flow (not harness.asUser, which inserts the
   * user row directly and would bypass the seed hook under test). */
  async function registerAndVerify(email: string): Promise<ApiClient> {
    await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'a-good-long-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    const msg = h.mailer.sent.find((m) => m.to === email);
    if (!msg) throw new Error('verify mail not sent');
    const href = msg.html.match(/href="([^"]+)"/)![1] as string;
    const token = new URL(href).searchParams.get('token')!;
    const res = await h.app.request('/auth/verify', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookieVal = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    if (!cookieVal) throw new Error('verify did not set session cookie');
    const cookieHeader = `${SESSION_COOKIE}=${cookieVal}; __Host-desk_csrf=test-csrf-token`;

    async function request(method: string, path: string, body?: unknown): Promise<Response> {
      const headers: Record<string, string> = { cookie: cookieHeader };
      if (method !== 'GET') headers['x-csrf-token'] = 'test-csrf-token';
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return h.app.request(path, init);
    }

    return {
      get: (path) => request('GET', path),
      post: (path, body) => request('POST', path, body),
      put: (path, body) => request('PUT', path, body),
      patch: (path, body) => request('PATCH', path, body),
      delete: (path, body) => request('DELETE', path, body),
    };
  }

  it('seeds the 18 defaults with fixed kinds on sign-up', async () => {
    const email = `cats-seed-${crypto.randomUUID()}@example.com`;
    const user = await registerAndVerify(email);

    const res = await user.get('/categories');
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.categories).toHaveLength(18);
    expect(body.categories.map((c: { name: string }) => c.name).sort()).toEqual(
      [...DEFAULT_CATEGORIES.map((c) => c.name)].sort(),
    );
    const rent = body.categories.find((c: { name: string }) => c.name === 'Rent');
    expect(rent.defaultKind).toBe('fixed');
    const groceries = body.categories.find((c: { name: string }) => c.name === 'Groceries');
    expect(groceries.defaultKind).toBe('variable');
    const other = body.categories.find((c: { name: string }) => c.name === 'Other');
    expect(other.defaultKind).toBeNull();
  });

  it('rename, recolour and archive via PATCH', async () => {
    const user = await h.asUser('cats-patch@example.com');
    const created = await j(await user.post('/categories', { name: 'Hobbies', colour: '#112233' }));

    const patched = await j(
      await user.patch(`/categories/${created.category.id}`, {
        name: 'Hobbies & crafts',
        colour: '#445566',
        archived: true,
      }),
    );
    expect(patched.category.name).toBe('Hobbies & crafts');
    expect(patched.category.colour).toBe('#445566');
    expect(patched.category.archivedAt).not.toBeNull();

    const unarchived = await j(
      await user.patch(`/categories/${created.category.id}`, { archived: false }),
    );
    expect(unarchived.category.archivedAt).toBeNull();
  });

  it('DELETE reassigns expenses to "Other" first', async () => {
    const user = await h.asUser('cats-delete@example.com');
    const created = await j(await user.post('/categories', { name: 'Temp', colour: '#000' }));

    const expense = await j(
      await user.post('/expenses', {
        description: 'Widget',
        amount: { minor: 500, currency: 'GBP' },
        date: '2026-09-05',
        categoryId: created.category.id,
        paidWith: 'card',
        kind: 'variable',
      }),
    );

    const del = await user.delete(`/categories/${created.category.id}`);
    expect(del.status).toBe(204);

    const [row] = await h.db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expense.expense.id));
    const [other] = await h.db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, user.userId));
    const otherRow = (
      await h.db.select().from(categoriesTable).where(eq(categoriesTable.userId, user.userId))
    ).find((c) => c.name === 'Other');
    expect(otherRow).toBeDefined();
    expect(row!.categoryId).toBe(otherRow!.id);
    void other;
  });

  it('"Other" is undeletable', async () => {
    const user = await h.asUser('cats-other-undeletable@example.com');
    // ensure an "Other" exists for this user (created lazily by the delete path above, or here)
    await user.post('/categories', { name: 'Other', colour: '#8a1f5c' });
    const list = await j(await user.get('/categories'));
    const other = list.categories.find((c: { name: string }) => c.name === 'Other');

    const res = await user.delete(`/categories/${other.id}`);
    expect(res.status).toBe(409);
    const body = await j(res);
    expect(body.error.code).toBe('conflict');
  });

  it('budget applies to any month (monthSummary reads budgetMinor directly)', async () => {
    const user = await h.asUser('cats-budget-any-month@example.com');
    const created = await j(
      await user.post('/categories', { name: 'Groceries2', colour: '#111', budgetMinor: 20000 }),
    );

    for (const month of ['2026-01', '2026-09']) {
      const res = await user.get(`/summary/month?month=${month}`);
      const body = await j(res);
      const entry = body.byCategory.find(
        (c: { categoryId: string }) => c.categoryId === created.category.id,
      );
      expect(entry.budget).toBe(20000);
    }
  });

  it('archived categories still appear in a month summary with their spend', async () => {
    const user = await h.asUser('cats-archived-tiles@example.com');
    const created = await j(
      await user.post('/categories', { name: 'ArchivedCat', colour: '#111', budgetMinor: 1000 }),
    );
    await user.post('/expenses', {
      description: 'Old spend',
      amount: { minor: 400, currency: 'GBP' },
      date: '2026-09-05',
      categoryId: created.category.id,
      paidWith: 'card',
      kind: 'variable',
    });
    await user.patch(`/categories/${created.category.id}`, { archived: true });

    const res = await j(await user.get('/summary/month?month=2026-09'));
    const entry = res.byCategory.find(
      (c: { categoryId: string }) => c.categoryId === created.category.id,
    );
    expect(entry).toBeDefined();
    expect(entry.spent).toBe(400);
  });

  it('currency-change job converts category budgets at the given rate', async () => {
    const user = await h.asUser('cats-currency-change@example.com');
    const created = await j(
      await user.post('/categories', {
        name: 'ConvertMe',
        colour: '#111',
        budgetMinor: 10000,
      }),
    );

    const source = categoriesRowSource(h.db);
    await runCurrencyChange(
      { userId: user.userId, fromCurrency: 'GBP', toCurrency: 'EUR', changeDate: '2026-09-18' },
      source,
      async () => ({ rate: '1.15' }),
      { updateProgress: async () => {} },
    );

    const [row] = await h.db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, created.category.id));
    expect(row!.budgetMinor).toBe(11500);
  });
});
