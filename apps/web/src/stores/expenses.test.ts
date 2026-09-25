import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExpensesStore } from './expenses.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('expenses store create()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('optimistically adds the expense, then reconciles with the server response', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    const serverExpense = {
      id: 'server-id',
      description: 'Coffee',
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
      notes: null,
      amountOriginal: 350,
      currencyOriginal: 'GBP',
      rateToDefault: null,
      rateDate: null,
      rateSource: null,
      amountDefault: null,
      rateOverridden: false,
      addedVia: 'dashboard',
      deletedAt: null,
      createdAt: '2026-09-18T00:00:00Z',
      updatedAt: '2026-09-18T00:00:00Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ expense: serverExpense }, 201))
      .mockResolvedValue(jsonResponse({ expenses: [], summary: null }));
    vi.stubGlobal('fetch', fetchMock);

    const before = store.expenses.length;
    const result = await store.create({
      description: 'Coffee',
      amount: { minor: 350, currency: 'GBP' },
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });

    expect(store.expenses.length).toBe(before + 1);
    expect(store.expenses[0]?.id).toBe('server-id');
    expect(result.expense.id).toBe('server-id');
  });

  it('rolls back the optimistic row when the POST fails', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'validation_failed', message: 'nope' } }, 422),
      );
    vi.stubGlobal('fetch', fetchMock);

    const before = store.expenses.length;
    await expect(
      store.create({
        description: 'Bad',
        amount: { minor: 100, currency: 'GBP' },
        date: '2026-09-18',
        categoryId: null,
        paidWith: 'card',
        kind: 'variable',
      }),
    ).rejects.toThrow();

    expect(store.expenses.length).toBe(before);
  });
});
