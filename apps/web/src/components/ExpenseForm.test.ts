import { createPinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseResponseT } from '@desk/contracts';
import ExpenseForm from './ExpenseForm.vue';

vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/categories')
      return {
        categories: [
          { id: 'c1', name: 'Groceries', archivedAt: null },
          { id: 'c2', name: 'Travel', archivedAt: null },
          { id: 'c3', name: 'Old', archivedAt: '2026-01-01T00:00:00Z' },
        ],
      };
    if (path === '/currencies') return { currencies: [] };
    return { expense: { id: 'x' }, expenses: [], summary: null };
  }),
}));

const KEY = 'desk.lastCategoryId';
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('ExpenseForm', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function mount(props: Record<string, unknown> = {}) {
    pinia = createPinia();
    app = createApp(ExpenseForm, props);
    app.use(pinia);
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await flush();
    return el;
  }
  const labels = (root: ParentNode) =>
    [...root.querySelectorAll('.desk-field-label')].map((l) => l.textContent);
  const expense = (over: Partial<ExpenseResponseT> = {}) =>
    ({
      id: 'e1',
      description: 'Shop',
      date: '2026-10-02',
      categoryId: 'c1',
      paidWith: 'card',
      kind: 'variable',
      notes: null,
      amountOriginal: 1234,
      currencyOriginal: 'GBP',
      amountDefault: 1234,
      rateOverridden: false,
      ...over,
    }) as ExpenseResponseT;

  it('asks amount, description, category, date first; the rest sits under More', async () => {
    const el = await mount();
    const details = el.querySelector('details')!;
    expect(details.querySelector('summary')?.textContent).toBe('More');
    const more = labels(details);
    expect(labels(el).filter((l) => !more.includes(l))).toEqual([
      'Amount',
      'Currency',
      'Description',
      'Category',
      'Date',
    ]);
    expect(labels(details)).toEqual(['Paid with', 'Kind', 'Notes (optional)']);
    expect(details.textContent).toContain('manual rate');
    expect(details.open).toBe(false);
  });

  it('focuses Amount when autofocus is set', async () => {
    const el = await mount({ autofocus: true });
    const first = el.querySelector('input')!;
    expect(first.closest('label')?.textContent).toContain('Amount');
    expect(document.activeElement).toBe(first);
  });

  it('opens More when editing an expense with notes, a non-default kind or an override', async () => {
    expect((await mount({ expense: expense({ notes: 'x' }) })).querySelector('details')!.open).toBe(
      true,
    );
    app?.unmount();
    expect(
      (await mount({ expense: expense({ kind: 'fixed' }) })).querySelector('details')!.open,
    ).toBe(true);
    app?.unmount();
    expect((await mount({ expense: expense() })).querySelector('details')!.open).toBe(false);
  });

  it('prefills the last category, ignores a stale or archived id, and never throws on storage', async () => {
    localStorage.setItem(KEY, 'c2');
    let el = await mount();
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('c2');
    app?.unmount();
    localStorage.setItem(KEY, 'gone');
    el = await mount();
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('');
    app?.unmount();
    localStorage.setItem(KEY, 'c3');
    el = await mount();
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('');
    app?.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    el = await mount();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it("does not override an edited expense's category with the remembered one", async () => {
    localStorage.setItem(KEY, 'c2');
    const el = await mount({ expense: expense() });
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('c1');
  });

  it('remembers the category after a successful add', async () => {
    const el = await mount();
    const type = async (input: HTMLInputElement, v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      await nextTick();
    };
    const field = (label: string) =>
      [...el.querySelectorAll('label')]
        .find((l) => l.querySelector('.desk-field-label')?.textContent === label)!
        .querySelector('input')!;
    await type(field('Amount'), '4.50');
    await type(field('Description'), 'Coffee');
    const sel = el.querySelector<HTMLSelectElement>('select')!;
    sel.value = 'c2';
    sel.dispatchEvent(new Event('change'));
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flush();
    const { apiFetch } = await import('../api/client.js');
    expect(apiFetch).toHaveBeenCalledWith('/expenses', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem(KEY)).toBe('c2');
  });
});

describe('ExpenseForm More disclosure marker', () => {
  it('draws a chevron on the More summary that turns when the group opens', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/ExpenseForm.vue', 'utf8');
    expect(src).toMatch(/\.desk-expense-form-more > summary::before \{[^}]*border-inline-end/);
    expect(src).toMatch(
      /\.desk-expense-form-more\[open\] > summary::before \{[^}]*rotate\(45deg\)/,
    );
  });
});
