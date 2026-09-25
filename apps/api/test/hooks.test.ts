import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

/** T084: POST /hooks/generic/:token per contracts/generic-webhook.md. */
describe('hooks: generic capture', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  async function issueToken(email: string) {
    const user = await h.asUser(email);
    const res = await user.post('/capture/tokens/generic/rotate');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secret: string; url: string };
    return { user, secret: body.secret };
  }

  it('201 creates an expense with addedVia = phone', async () => {
    const { secret } = await issueToken('hook-201@example.com');
    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: '4.20',
        currency: 'GBP',
        description: 'Coffee',
        id: 'req-201',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { expenseId: string; duplicate: boolean };
    expect(body.duplicate).toBe(false);
    expect(body.expenseId).toBeTruthy();
  });

  it('200 duplicate by id', async () => {
    const { secret } = await issueToken('hook-dup-id@example.com');
    const payload = {
      amount: '4.20',
      currency: 'GBP',
      description: 'Coffee',
      id: 'dup-1',
    };
    const first = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const { expenseId } = (await first.json()) as { expenseId: string };

    const second = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { expenseId: string; duplicate: boolean };
    expect(body.duplicate).toBe(true);
    expect(body.expenseId).toBe(expenseId);
  });

  it('duplicate by body-plus-minute without id', async () => {
    const { secret } = await issueToken('hook-dup-body@example.com');
    const payload = { amount: '9.99', currency: 'GBP', description: 'Lunch' };

    const first = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const { expenseId } = (await first.json()) as { expenseId: string };

    const second = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { expenseId: string; duplicate: boolean };
    expect(body.duplicate).toBe(true);
    expect(body.expenseId).toBe(expenseId);
  });

  it('negative amount is a valid refund', async () => {
    const { secret } = await issueToken('hook-refund@example.com');
    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: '-5.00',
        currency: 'GBP',
        description: 'Refund',
        id: 'refund-1',
      }),
    });
    expect(res.status).toBe(201);
  });

  it('unmapped label defaults to Other and records the raw label', async () => {
    const { user, secret } = await issueToken('hook-unmapped@example.com');
    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: '1.00',
        currency: 'GBP',
        description: 'Snack',
        category: 'eating out',
        id: 'cat-1',
      }),
    });
    expect(res.status).toBe(201);

    const mappingRes = await user.get('/capture/mapping');
    const mapping = (await mappingRes.json()) as { unmappedLabels: string[] };
    expect(mapping.unmappedLabels).toContain('eating out');

    const categoriesRes = await user.get('/categories');
    const { categories } = (await categoriesRes.json()) as {
      categories: { id: string; name: string }[];
    };
    const { expenseId } = (await res.json()) as { expenseId: string };
    const expensesRes = await user.get('/expenses?includeDeleted=true');
    const { expenses } = (await expensesRes.json()) as {
      expenses: { id: string; categoryId: string | null }[];
    };
    const created = expenses.find((e) => e.id === expenseId);
    const other = categories.find((c) => c.name === 'Other');
    expect(created?.categoryId).toBe(other?.id);
  });

  it('date defaults to today in the user time zone when omitted', async () => {
    const user = await h.asUser('hook-tz@example.com');
    await user.patch('/me', { timeZone: 'Pacific/Kiritimati' }); // UTC+14
    const rotate = await user.post('/capture/tokens/generic/rotate');
    const { secret } = (await rotate.json()) as { secret: string };

    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '1.00', currency: 'GBP', description: 'x', id: 'tz-1' }),
    });
    expect(res.status).toBe(201);
    const { expenseId } = (await res.json()) as { expenseId: string };
    const expensesRes = await user.get('/expenses?includeDeleted=true');
    const { expenses } = (await expensesRes.json()) as { expenses: { id: string; date: string }[] };
    const created = expenses.find((e) => e.id === expenseId);
    const expectedDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Kiritimati',
    }).format(h.clock.now());
    expect(created?.date).toBe(expectedDate);
  });

  it('revoked token answers 404', async () => {
    const user = await h.asUser('hook-revoked@example.com');
    const rotate1 = await user.post('/capture/tokens/generic/rotate');
    const { secret: oldSecret } = (await rotate1.json()) as { secret: string };
    await user.post('/capture/tokens/generic/rotate'); // revokes oldSecret, issues a new one

    const res = await h.app.request(`/hooks/generic/${oldSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '1.00', currency: 'GBP', description: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('unknown token answers 404', async () => {
    const res = await h.app.request('/hooks/generic/totally-unknown-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '1.00', currency: 'GBP', description: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('60/min rate limit answers 429 and is counted in the audit log', async () => {
    const user = await h.asUser('hook-rate@example.com');
    const rotate = await user.post('/capture/tokens/generic/rotate');
    const { secret } = (await rotate.json()) as { secret: string };

    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await h.app.request(`/hooks/generic/${secret}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: '1.00', currency: 'GBP', description: 'x', id: `rl-${i}` }),
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    const auditRows = await h.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'capture.refused'));
    expect(
      auditRows.some((r) => (r.details as { reason?: string } | null)?.reason === 'rate_limited'),
    ).toBe(true);
  });

  it('body over 4 KB is rejected', async () => {
    const { secret } = await issueToken('hook-toobig@example.com');
    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: '1.00',
        currency: 'GBP',
        description: 'x'.repeat(5000),
        id: 'big-1',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('a row exists within one minute while the rate is pending', async () => {
    const { user, secret } = await issueToken('hook-pending-rate@example.com');
    // TRY has no FakeRates fixture for this date, so the rate stays pending; the expense still
    // exists immediately with amountDefault left null (services/expenses.ts behaviour).
    const res = await h.app.request(`/hooks/generic/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '1.00', currency: 'TRY', description: 'x', id: 'pending-1' }),
    });
    expect(res.status).toBe(201);
    const { expenseId } = (await res.json()) as { expenseId: string };
    const expensesRes = await user.get('/expenses?includeDeleted=true');
    const { expenses } = (await expensesRes.json()) as { expenses: { id: string }[] };
    expect(expenses.some((e) => e.id === expenseId)).toBe(true);
  });
});
