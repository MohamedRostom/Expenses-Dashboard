import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MonthView from './MonthView.vue';

vi.mock('../components/widgets/WidgetStrip.vue', () => ({
  __esModule: true,
  default: () => h('div'),
}));
vi.mock('../components/ForecastTile.vue', () => ({ __esModule: true, default: () => h('div') }));
vi.mock('../offline/queue.js', () => ({
  list: async () => [],
  discard: async () => {},
  retry: async () => {},
  estimatedTotal: () => 0,
}));
vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith('/expenses'))
      return {
        expenses: [
          {
            id: 'e1',
            description: 'Shop',
            date: '2026-10-02',
            categoryId: 'c1',
            amountOriginal: 1234,
            currencyOriginal: 'GBP',
          },
        ],
        summary: {
          month: '2026-10',
          currency: 'GBP',
          spent: 1234,
          budgeted: 5000,
          remaining: 3766,
          pendingRates: 0,
          byCategory: [
            { categoryId: 'c1', spent: 1234, budget: 5000, overBudget: false },
            { categoryId: 'c2', spent: 500, budget: null, overBudget: false },
          ],
        },
      };
    if (path === '/categories')
      return {
        categories: [
          { id: 'c1', name: 'Groceries' },
          { id: 'c2', name: 'Travel' },
        ],
      };
    return { months: [] };
  }),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('MonthView category rows (T032)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => app?.unmount());

  it('prints the currency once per amount (regression: "£12.34 GBP GBP")', async () => {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: MonthView }],
    });
    app = createApp(MonthView);
    app.use(router).use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    await router.push('/');
    app.mount(el);
    await flush();
    const rows = [...el.querySelectorAll('.desk-category-bars-row')];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.textContent).not.toMatch(/GBP\s*GBP/);
    expect(rows[0]!.textContent).toMatch(/£12\.34 GBP\s*\/\s*£50\.00 GBP/);
    expect(rows[1]!.textContent).toMatch(/£5\.00 GBP/);
  });
});
