import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MonthView from './MonthView.vue';

vi.mock('../components/widgets/WidgetStrip.vue', () => ({
  __esModule: true,
  default: () => h('div', { 'data-testid': 'widget-strip-mount' }),
}));
vi.mock('../components/ForecastTile.vue', () => ({ __esModule: true, default: () => h('div') }));
vi.mock('../offline/queue.js', () => ({
  list: async () => [],
  discard: async () => {},
  retry: async () => {},
  estimatedTotal: () => 0,
}));
const money = vi.hoisted(() => ({ spent: 1234, budgeted: 5000, remaining: 3766 }));

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
          spent: money.spent,
          budgeted: money.budgeted,
          remaining: money.remaining,
          pendingRates: 0,
          byCategory: [
            { categoryId: 'c1', spent: 1234, budget: 5000, overBudget: false },
            { categoryId: 'c2', spent: 500, budget: null, overBudget: false },
            { categoryId: 'c3', spent: 500, budget: null, overBudget: false },
          ],
        },
      };
    if (path === '/categories')
      return {
        categories: [
          { id: 'c1', name: 'Groceries' },
          { id: 'c2', name: 'Travel' },
          { id: 'c3', name: 'Books' },
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
  beforeEach(() => Object.assign(money, { spent: 1234, budgeted: 5000, remaining: 3766 }));
  afterEach(() => app?.unmount());

  async function mount() {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: MonthView },
        { path: '/settings/categories', component: { template: '<div />' } },
      ],
    });
    app = createApp(MonthView);
    app.use(router).use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    await router.push('/');
    app.mount(el);
    await flush();
    return el;
  }

  it('departure tile with no budget says so, links to set one, and never shows a negative left', async () => {
    Object.assign(money, { budgeted: 0, remaining: -1234 });
    const el = await mount();
    const tile = el.querySelector('[data-tile]')!;
    expect(tile.textContent).toContain('No budget set');
    expect(tile.textContent).not.toMatch(/-£|over/i);
    expect(tile.querySelector('a')?.getAttribute('href')).toBe('/settings/categories');
  });

  it('departure tile over budget: label, red minus figure and the word over', async () => {
    Object.assign(money, { budgeted: 1000, remaining: -234 });
    const el = await mount();
    const tile = el.querySelector('[data-tile]')!;
    expect(tile.querySelector('.desk-tile-label')?.textContent).toBe('Over budget this month');
    const fig = tile.querySelector('[data-tile-primary="figure"]')!;
    expect(fig.textContent).toMatch(/^-£2\.34/);
    expect(fig.classList.contains('desk-tile-value--critical')).toBe(true);
    expect(tile.textContent).toMatch(/over/);
  });

  it('departure tile under budget keeps its label and adds when the month ends', async () => {
    const el = await mount();
    const tile = el.querySelector('[data-tile]')!;
    expect(tile.querySelector('.desk-tile-label')?.textContent).toBe('Left this month');
    expect(tile.textContent).toMatch(/month ends \S+ \S+/);
  });

  it('shows the category bars by default with the table one tab away, not stacked', async () => {
    const el = await mount();
    expect(el.querySelector('.desk-category-bars-row')).not.toBeNull();
    expect(el.querySelector('table[aria-label="Spending by category"], table')).not.toBeNull();
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Bars', 'Table']);
    expect(el.querySelectorAll('[data-panel="categories"] table')).toHaveLength(0);
    (el.querySelectorAll('[role="tab"]')[1] as HTMLElement).click();
    await flush();
    expect(el.querySelector('[data-panel="categories"] table')).not.toBeNull();
    expect(el.querySelector('.desk-category-bars-row')).toBeNull();
  });

  it('lays the entries and category panels out on the shared .board-grid (T023)', async () => {
    const el = await mount();
    expect(el.querySelector('.desk-month-view-columns')!.classList.contains('board-grid')).toBe(
      true,
    );
  });

  it('mounts the widget strip after the tiles', async () => {
    const el = await mount();
    const tiles = el.querySelector('.desk-month-view-tiles')!;
    const strip = el.querySelector('[data-testid="widget-strip-mount"]')!;
    expect(tiles.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('month switcher uses SVG chevrons, not text glyphs', async () => {
    const el = await mount();
    const prev = el.querySelector('button[aria-label="Previous month"]')!;
    expect(prev.querySelector('svg path')?.getAttribute('d')).toBe('M10 3 5 8l5 5');
    expect(prev.textContent?.trim()).toBe('');
    const next = el.querySelector('button[aria-label="Next month"]')!;
    expect(next.querySelector('svg path')?.getAttribute('d')).toBe('m6 3 5 5-5 5');
  });

  it('prints the currency once per amount (regression: "£12.34 GBP GBP")', async () => {
    const el = await mount();
    const rows = [...el.querySelectorAll('.desk-category-bars-row')];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.textContent).not.toMatch(/GBP\s*GBP/);
    expect(rows[0]!.textContent).toMatch(/£12\.34 GBP\s*\/\s*£50\.00 GBP/);
    expect(rows[1]!.textContent).toMatch(/£5\.00 GBP/);
    // Equal spend never swaps between runs: ordered by spend, then name (Books before Travel).
    expect(rows.map((r) => /Groceries|Books|Travel/.exec(r.textContent ?? '')?.[0])).toEqual([
      'Groceries',
      'Books',
      'Travel',
    ]);
  });
});
