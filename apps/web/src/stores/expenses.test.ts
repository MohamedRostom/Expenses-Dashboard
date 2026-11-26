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

describe('expenses store: edits show before the server answers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 'e1',
      description: 'Lunch',
      date: '2026-09-18',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
      notes: null,
      amountOriginal: 350,
      currencyOriginal: 'GBP',
      rateToDefault: '1',
      rateDate: '2026-09-18',
      rateSource: 'none',
      amountDefault: 350,
      rateOverridden: false,
      addedVia: 'dashboard',
      deletedAt: null,
      createdAt: '2026-09-18T00:00:00Z',
      updatedAt: '2026-09-18T00:00:00Z',
      ...over,
    }) as ReturnType<typeof useExpensesStore>['expenses'][number];

  /** A fetch the test answers by hand, so it can look at the store while the request is open. */
  function heldFetch() {
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((r) => (answer = r))));
    return (r: Response) => answer(r);
  }

  it('update() applies the edit at once, conversion pending, then takes the server row', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    store.expenses = [row()];
    const answer = heldFetch();

    const saving = store.update('e1', {
      description: 'Dinner',
      amount: { minor: 500, currency: 'EUR' },
    });
    expect(store.expenses[0]).toMatchObject({
      description: 'Dinner',
      amountOriginal: 500,
      currencyOriginal: 'EUR',
      amountDefault: null, // the converted figure is the server's to give
      rateToDefault: null,
    });

    answer(jsonResponse({ expense: row({ description: 'Dinner', amountDefault: 430 }) }));
    await saving;
    expect(store.expenses[0]?.amountDefault).toBe(430);
  });

  it('update() keeps the conversion when only a label changes', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    store.expenses = [row()];
    heldFetch();
    void store.update('e1', { notes: 'with Sam' });
    expect(store.expenses[0]).toMatchObject({ notes: 'with Sam', amountDefault: 350 });
  });

  it('update() puts the old row back and rethrows when the save fails', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    store.expenses = [row()];
    const answer = heldFetch();

    const saving = store.update('e1', { description: 'Dinner' });
    answer(jsonResponse({ error: { code: 'validation_failed', message: 'nope' } }, 422));
    await expect(saving).rejects.toThrow();
    expect(store.expenses[0]?.description).toBe('Lunch');
  });

  it('remove() drops the row at once and puts it back in its place on failure', async () => {
    setActivePinia(createPinia());
    const store = useExpensesStore();
    store.expenses = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    const answer = heldFetch();

    const removing = store.remove('b');
    expect(store.expenses.map((e) => e.id)).toEqual(['a', 'c']);

    answer(jsonResponse({ error: { code: 'internal', message: 'down' } }, 500));
    await expect(removing).rejects.toThrow();
    expect(store.expenses.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
