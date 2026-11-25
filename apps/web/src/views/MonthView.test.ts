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
  flushWhenOnline: async () => {},
  estimatedTotal: () => 0,
}));
const money = vi.hoisted(() => ({
  spent: 1234,
  budgeted: 5000,
  remaining: 3766,
  catSpent: 1234,
  many: false,
  rows: null as Record<string, unknown>[] | null,
  budgetMode: 'mixed' as 'mixed' | 'none' | 'all',
}));

vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith('/expenses'))
      return {
        expenses:
          money.rows ??
          Array.from({ length: money.many ? 10 : 1 }, (_, i) => ({
            id: `e${i + 1}`,
            description: i === 0 ? 'Shop' : `Item ${i + 1}`,
            date: '2026-10-02',
            categoryId: 'c1',
            amountOriginal: 1234,
            currencyOriginal: 'GBP',
          })),
        summary: {
          month: '2026-10',
          currency: 'GBP',
          spent: money.spent,
          budgeted: money.budgeted,
          remaining: money.remaining,
          pendingRates: 0,
          byCategory: [
            {
              categoryId: 'c1',
              spent: money.catSpent,
              budget: money.budgetMode === 'none' ? null : 5000,
              overBudget: money.catSpent > 5000,
            },
            {
              categoryId: 'c2',
              spent: 500,
              budget: money.budgetMode === 'all' ? 800 : null,
              overBudget: false,
            },
            {
              categoryId: 'c3',
              spent: 500,
              budget: money.budgetMode === 'all' ? 800 : null,
              overBudget: false,
            },
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
    if (path.startsWith('/summary/year'))
      return {
        months: [
          { month: '2026-09', spent: 900 },
          { month: '2026-10', spent: 1234 },
        ],
      };
    return { months: [] };
  }),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('MonthView expense delete confirms in the app, never with window.confirm', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    vi.mocked((await import('../api/client.js')).apiFetch).mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('window.confirm must not be called');
    });
  });
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
    confirmSpy.mockRestore();
  });

  async function mountView() {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: MonthView }],
    });
    app = createApp(MonthView);
    app.use(router).use(createPinia());
    document.querySelector('#top-bar-actions')?.remove();
    const bar = document.createElement('div');
    bar.id = 'top-bar-actions';
    document.body.appendChild(bar);
    const el = document.createElement('div');
    document.body.appendChild(el);
    await router.push('/');
    app.mount(el);
    await flush();
    return el;
  }
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const inDialog = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (b) => b.textContent?.trim() === label,
    );
  const deleteCalls = async () => {
    const { apiFetch } = await import('../api/client.js');
    return vi
      .mocked(apiFetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE');
  };

  it('Delete opens a dialog that says it goes to the Bin; only its Delete button deletes', async () => {
    const el = await mountView();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click();
    await flush();
    expect(dialog()?.textContent).toContain('Shop');
    expect(dialog()?.textContent).toContain('Bin');
    expect(await deleteCalls()).toHaveLength(0);
    inDialog('Delete')!.click();
    await flush();
    const calls = await deleteCalls();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain('/expenses/e1');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('Cancel deletes nothing', async () => {
    const el = await mountView();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click();
    await flush();
    inDialog('Cancel')!.click();
    await flush();
    expect(dialog()).toBeNull();
    expect(await deleteCalls()).toHaveLength(0);
  });
});

describe('MonthView category rows (T032)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  beforeEach(() =>
    Object.assign(money, {
      spent: 1234,
      budgeted: 5000,
      remaining: 3766,
      catSpent: 1234,
      many: false,
      rows: null,
      budgetMode: 'mixed',
    }),
  );
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
    document.querySelector('#top-bar-actions')?.remove();
    const bar = document.createElement('div');
    bar.id = 'top-bar-actions';
    document.body.appendChild(bar);
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

  it('no-budget hero prints its words in the words style, not as a Display figure (T048)', async () => {
    Object.assign(money, { budgeted: 0, remaining: 0 });
    const el = await mount();
    const fig = el.querySelector('[data-tile-primary="figure"]')!;
    expect(fig.textContent).toBe('No budget set');
    expect(fig.classList.contains('desk-tile-value--words')).toBe(true);
  });

  it('Category budgets and Recent entries are labels inside their glass panels (T048)', async () => {
    const el = await mount();
    for (const [panel, name] of [
      ['categories', 'Category budgets'],
      ['entries', 'Recent entries'],
    ] as const) {
      const h = el.querySelector(`[data-panel="${panel}"] .desk-panel-frame-flap h3`);
      expect(h?.textContent).toBe(name);
    }
  });

  it('entry rows carry the date in the item subline for phone width (T049)', async () => {
    const el = await mount();
    const sub = el.querySelector('[data-panel="entries"] tbody .desk-item > .desk-item-date');
    expect(sub?.textContent).toMatch(/2/);
    expect(el.querySelector('[data-panel="entries"] tbody .desk-item-cat')?.textContent).toContain(
      'Groceries',
    );
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

  it('departure tile under budget keeps its label', async () => {
    const el = await mount();
    const tile = el.querySelector('[data-tile]')!;
    expect(tile.querySelector('.desk-tile-label')?.textContent).toBe('Left this month');
  });

  it('shows the category bars by default with the table one tab away, not stacked', async () => {
    const el = await mount();
    expect(el.querySelector('.desk-category-bars-row')).not.toBeNull();
    expect(el.querySelector('table[aria-label="Spending by category"], table')).not.toBeNull();
    const tabsIn = '[data-panel="categories"] [role="tab"]';
    const tabs = [...el.querySelectorAll(tabsIn)].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Bars', 'Table']);
    expect(el.querySelectorAll('[data-panel="categories"] table')).toHaveLength(0);
    (el.querySelectorAll(tabsIn)[1] as HTMLElement).click();
    await flush();
    expect(el.querySelector('[data-panel="categories"] table')).not.toBeNull();
    expect(el.querySelector('.desk-category-bars-row')).toBeNull();
  });

  it('puts Entries beside a column of chart, forecast and category budgets (ADR-0008)', async () => {
    const el = await mount();
    const row = el.querySelector('.desk-month-view-columns')!;
    expect(row.classList.contains('board-grid')).toBe(false);
    const panels = [...row.querySelectorAll('[data-panel]')].map((p) =>
      p.getAttribute('data-panel'),
    );
    expect(panels).toEqual(['entries', 'chart', 'categories']);
  });

  it('lays out by grid breakpoints: hero beside stats from 768, two columns from 1024', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/MonthView.vue', 'utf8');
    expect(src).toContain('@media (min-width: 768px)');
    expect(src).toContain('@media (min-width: 1024px)');
    expect(src).toContain('max-width: 1160px');
    expect(src).not.toContain('auto-fit');
  });

  it('the row checkbox input is the whole target (44px on phones, 24px from 1024) with a drawn 20px box', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/MonthView.vue', 'utf8');
    const el = await mount();
    expect(
      el.querySelector(
        'label.desk-entries-check-wrap > input.desk-entries-check + .desk-entries-box',
      ),
    ).not.toBeNull();
    const input = /\.desk-entries-check \{([^}]*)\}/.exec(src)![1]!;
    expect(input).toContain('appearance: none');
    expect(input).toContain('inset: 0');
    expect(input).toContain('background: transparent');
    const box = /\.desk-entries-box \{([^}]*)\}/.exec(src)![1]!;
    expect(box).toMatch(/border: 1px solid color-mix\(/);
    expect(box).toContain('background: transparent');
    expect(box).toContain('var(--space-5)');
    expect(
      /\.desk-entries-check:checked \+ \.desk-entries-box \{([^}]*)\}/.exec(src)![1],
    ).toContain('var(--color-accent)');
    expect(src).toMatch(/\.desk-entries-check:checked \+ \.desk-entries-box::after/);
    expect(src).toMatch(/\.desk-entries-check:focus-visible \+ \.desk-entries-box/);
    expect(/\.desk-entries-check-wrap \{([^}]*)\}/.exec(src)![1]).toContain('var(--target-min)');
    const wide = /@media \(min-width: 1024px\) \{\s*\.desk-entries-check-wrap \{([^}]*)\}/.exec(
      src,
    )![1]!;
    expect(wide).toContain('inline-size: var(--space-6)');
    expect(wide).toContain('block-size: var(--space-6)');
  });

  it('the hero tile keeps its label on top and drops the figure and note to the bottom', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/MonthView.vue', 'utf8');
    expect(src).toMatch(
      /\.desk-tile--primary :deep\(\.desk-tile-value\) \{[^}]*margin-block-start: auto/,
    );
  });

  it('keeps the page gutters the other screens keep (the shell only insets for the nav)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/MonthView.vue', 'utf8');
    expect(src).toMatch(
      /\.desk-month-view \{[^}]*padding: var\(--space-4\) var\(--gutter-fluid\)/s,
    );
  });

  it('greets in the greeting row with a paragraph, not a heading, and no in-page h1', async () => {
    const el = await mount();
    const row = el.querySelector('.desk-month-view-hello')!;
    expect(el.querySelector('h1')).toBeNull();
    expect(row.querySelector('h2')).toBeNull();
    expect(row.querySelector('p')?.textContent).toBe('Good morning');
    expect(row.textContent).toMatch(/spending overview for .*\d{4}/);
  });

  it('puts the month switcher and Add expense in the top bar actions, label as "Nov 2026"', async () => {
    const el = await mount();
    const actions = document.querySelector('#top-bar-actions')!;
    expect(
      el.querySelector('.desk-month-view-hello')!.querySelector('.desk-month-switcher'),
    ).toBeNull();
    expect(actions.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
    expect(actions.querySelector('button[aria-label="Next month"]')).not.toBeNull();
    expect(actions.querySelector('.desk-month-label')?.textContent).toMatch(
      /^[A-Z][a-z]{2} \d{4}$/,
    );
    const add = [...actions.querySelectorAll('button')].find(
      (b) => b.textContent?.replace(/\s*n$/, '').trim() === 'Add expense',
    )!;
    expect(add).toBeTruthy();
    add.click();
    await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('hides the top-bar Add below 1024px (the bottom bar carries it)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/MonthView.vue', 'utf8');
    expect(src).toMatch(
      /@media \(max-width: 1023px\)[^{]*\{[^}]*desk-topbar-add[^}]*display:\s*none/s,
    );
  });

  it('the departure tile is the only filled tile, ahead of four stat tiles', async () => {
    const el = await mount();
    const filled = el.querySelectorAll('.desk-tile-block--filled');
    expect(filled).toHaveLength(1);
    expect(filled[0]!.querySelector('.desk-tile-label')?.textContent).toBe('Left this month');
    expect(filled[0]!.textContent).not.toMatch(/% of budget used/);
    expect(filled[0]!.querySelector('[role="img"]')).toBeNull();
    const labels = [
      ...el.querySelectorAll('.desk-month-view-stats [data-tile] .desk-tile-label'),
    ].map((l) => l.textContent);
    expect(labels).toEqual(['Spent this month', 'Daily average', 'Entries', 'Over budget']);
    expect(el.querySelectorAll('.desk-month-view-stats .desk-tile-block--filled')).toHaveLength(0);
  });

  it('says in words how many categories are over and by how much; no banner when none', async () => {
    let el = await mount();
    expect(el.querySelector('[data-testid="over-banner"]')).toBeNull();
    app?.unmount();
    money.catSpent = 6000;
    el = await mount();
    const banner = el.querySelector('[data-testid="over-banner"]')!;
    expect(banner.textContent).toMatch(/1 category over budget/);
    expect(banner.textContent).toContain('£10.00');
    const over = [...el.querySelectorAll('.desk-month-view-stats [data-tile]')].at(-1)!;
    expect(over.textContent).toMatch(/1 category/);
    expect(over.querySelector('.desk-tile-value--critical')).not.toBeNull();
  });

  it('spend by month keeps its table one tab away', async () => {
    const el = await mount();
    const chart = el.querySelector('[data-testid="trend-sparkline"]')!;
    expect(chart.querySelector('table')).toBeNull();
    const tab = [...chart.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent?.trim() === 'Table',
    );
    (tab as HTMLElement).click();
    await flush();
    expect(chart.querySelector('table')?.textContent).toContain('2026-09');
  });

  it('truncates recent entries and keeps every entry reachable through View all', async () => {
    money.many = true;
    const el = await mount();
    expect(el.querySelectorAll('[data-panel="entries"] tbody tr')).toHaveLength(8);
    const all = [...el.querySelectorAll('[data-panel="entries"] button')].find((b) =>
      /View all 10 entries/.test(b.textContent ?? ''),
    ) as HTMLElement;
    all.click();
    await flush();
    expect(el.querySelectorAll('[data-panel="entries"] tbody tr')).toHaveLength(10);
  });

  it('mounts the widget strip directly after the greeting row, before the tiles', async () => {
    const el = await mount();
    const hello = el.querySelector('.desk-month-view-hello')!;
    const strip = el.querySelector('[data-testid="widget-strip-mount"]')!;
    const bento = el.querySelector('.desk-month-view-bento')!;
    expect(hello.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(bento) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('month switcher uses SVG chevrons, not text glyphs', async () => {
    await mount();
    const prev = document.querySelector('button[aria-label="Previous month"]')!;
    expect(prev.querySelector('svg path')?.getAttribute('d')).toBe('M10 3 5 8l5 5');
    expect(prev.textContent?.trim()).toBe('');
    const next = document.querySelector('button[aria-label="Next month"]')!;
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

  describe('spec 005 month view', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    const tileOf = (el: Element) => el.querySelector('[data-tile]')!;
    const rows = (el: Element) => [
      ...el.querySelectorAll(
        '[data-panel="entries"] tbody tr:not(.desk-entries-none):not(.desk-entries-rate-row)',
      ),
    ];
    const type = async (input: HTMLInputElement, v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      await flush();
    };
    const field = (el: Element, label: string) =>
      [...el.querySelectorAll('label')]
        .find((l) => l.querySelector('.desk-field-label')?.textContent === label)!
        .querySelector('input, select') as HTMLInputElement & HTMLSelectElement;
    const confirmDelete = async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find((b) => b.textContent?.trim() === 'Delete')!
        .click();
      await flush();
    };
    const calls = async (method: string) => {
      const { apiFetch } = await import('../api/client.js');
      return vi
        .mocked(apiFetch)
        .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method)
        .map(([path]) => String(path));
    };

    it('C1 hero says how much per day for how many days, with the code, and no usage line', async () => {
      Object.assign(money, { remaining: 30000, spent: 20000, budgeted: 50000 });
      const el = await mount();
      const tile = tileOf(el);
      expect(tile.textContent).toContain('£25.00 GBP a day for 12 days');
      expect(tile.querySelector('[data-tile-primary="figure"]')!.textContent).toBe('£300.00 GBP');
      expect(tile.textContent).not.toContain('% of budget used');
      expect(tile.textContent).not.toMatch(/spent/i);
    });

    it('C1 pluralises the last day and shows nothing per day when over budget or in another month', async () => {
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
      Object.assign(money, { remaining: 30000, spent: 20000, budgeted: 50000 });
      let el = await mount();
      expect(tileOf(el).textContent).toContain('a day for 1 day');
      expect(tileOf(el).textContent).not.toContain('1 days');
      // another month: the day count is relative to now, so no note
      document.querySelector<HTMLElement>('button[aria-label="Previous month"]')!.click();
      await flush();
      expect(tileOf(el).textContent).not.toContain('a day');
      app?.unmount();
      Object.assign(money, { remaining: -234, spent: 1234, budgeted: 1000 });
      el = await mount();
      expect(tileOf(el).textContent).not.toContain('a day');
    });

    const eur = (over: Record<string, unknown> = {}) => ({
      id: 'f1',
      description: 'Hotel',
      date: '2026-10-12',
      categoryId: 'c1',
      amountOriginal: 2000,
      currencyOriginal: 'EUR',
      amountDefault: 1720,
      rateToDefault: '0.86',
      rateDate: '2026-10-12',
      rateSource: 'ecb',
      rateOverridden: false,
      ...over,
    });
    const gbp = {
      ...eur(),
      id: 'g1',
      description: 'Tea',
      currencyOriginal: 'GBP',
      amountDefault: 2000,
    };

    const rateRowOf = (tr: Element) => {
      const next = tr.nextElementSibling;
      return next?.classList.contains('desk-entries-rate-row') ? next : null;
    };

    it('C2 a converted row is followed by a full-width rate row: rate, its date and source; a home row has none', async () => {
      money.rows = [eur(), gbp];
      const el = await mount();
      const [conv, home] = rows(el);
      expect(conv!.classList.contains('desk-entries-converted')).toBe(true);
      const rateRow = rateRowOf(conv!)!;
      expect(rateRow.classList.contains('desk-entries-converted')).toBe(true);
      const cell = rateRow.querySelector('td')!;
      expect(Number(cell.getAttribute('colspan'))).toBeGreaterThanOrEqual(3);
      expect(rateRow.querySelector('input, button, a, [tabindex]')).toBeNull();
      const line = rateRow.querySelector('.desk-item-rate')!.textContent!;
      expect(line).toContain('1 EUR = 0.86 GBP');
      expect(line).toMatch(/rate of /);
      expect(line).toContain('ECB');
      expect(line).not.toContain('€20.00');
      expect(line).not.toContain('manual rate');
      expect(rateRow.querySelector('.desk-item-rate')!.hasAttribute('title')).toBe(false);
      // Read with the entry: the name points at the line.
      const id = rateRow.querySelector('.desk-item-rate')!.id;
      expect(id).not.toBe('');
      expect(conv!.querySelector('.desk-item-name')!.getAttribute('aria-describedby')).toBe(id);
      expect(home!.classList.contains('desk-entries-converted')).toBe(false);
      expect(rateRowOf(home!)).toBeNull();
    });

    it('C2 the item name carries its full text as a title, so an ellipsis never hides it', async () => {
      money.rows = [eur()];
      const el = await mount();
      const name = rows(el)[0]!.querySelector('.desk-item-name')!;
      expect(name.getAttribute('title')).toBe('Hotel');
    });

    it('C2 the rate row spans only the columns the board shows: 3 on a phone, 4 from 480, 5 from 768', async () => {
      const cols = async (width: number) => {
        vi.stubGlobal('matchMedia', (q: string) => ({
          matches: Number(/min-width: (\d+)px/.exec(q)?.[1]) <= width,
          addEventListener: () => {},
          removeEventListener: () => {},
        }));
        money.rows = [eur()];
        const el = await mount();
        const colspan = rateRowOf(rows(el)[0]!)!.querySelector('td')!.getAttribute('colspan');
        app?.unmount();
        return colspan;
      };
      expect(await cols(360)).toBe('3');
      expect(await cols(600)).toBe('4');
      expect(await cols(1280)).toBe('5');
      vi.unstubAllGlobals();
    });

    it('C2 says manual rate when overridden; a pending rate keeps its word, with no rate row', async () => {
      money.rows = [
        eur({ rateOverridden: true, rateSource: 'manual' }),
        eur({ id: 'f2', description: 'Pending', amountDefault: null, rateToDefault: null }),
      ];
      const el = await mount();
      const [manual, pending] = rows(el);
      expect(rateRowOf(manual!)!.textContent).toContain('manual rate');
      expect(rateRowOf(pending!)).toBeNull();
      expect(pending!.textContent).toContain('rate pending');
    });

    it('C2 an overridden rate (source "user", as the API stores it) says manual rate once, not "user"', async () => {
      money.rows = [eur({ rateOverridden: true, rateSource: 'user' })];
      const el = await mount();
      const line = rateRowOf(rows(el)[0]!)!.textContent!;
      expect(line).toContain('manual rate');
      expect(line).not.toMatch(/\buser\b/);
    });

    it('C2 the rate row wraps rather than ellipsising and shares the entry row tint without a rule', async () => {
      const { readFileSync } = await import('node:fs');
      const src = readFileSync('src/views/MonthView.vue', 'utf8');
      const rule = /\.desk-item-rate \{([^}]*)\}/.exec(src)![1]!;
      expect(rule).not.toContain('nowrap');
      expect(rule).not.toContain('ellipsis');
      expect(src).toMatch(/tr\.desk-entries-has-rate > td \{[^}]*border-bottom: 0/);
    });

    it('C4 mixed: budgeted bars plus a closed group of the rest; none: closed group and a Set a budget line; all: no group', async () => {
      let el = await mount();
      const panel = () => el.querySelector('[data-panel="categories"]')!;
      const details = () => panel().querySelector<HTMLDetailsElement>('details')!;
      const summary = () =>
        details().querySelector('summary')!.textContent!.replace(/\s+/g, ' ').trim();
      expect(summary()).toBe('2 categories without a budget');
      expect(details().open).toBe(false);
      expect(details().querySelectorAll('.desk-category-bars-row')).toHaveLength(2);
      expect(panel().querySelectorAll('.desk-category-bars-row')).toHaveLength(3);
      expect(
        [...panel().querySelectorAll('.desk-category-bars-row')]
          .filter((r) => !details().contains(r))
          .map((r) => r.textContent),
      ).toEqual([expect.stringContaining('Groceries')]);
      app?.unmount();
      money.budgetMode = 'none';
      el = await mount();
      expect(details().open).toBe(false);
      expect(summary()).toBe('3 categories without a budget');
      const hint = panel().querySelector<HTMLAnchorElement>('.desk-month-view-nobudget a')!;
      expect(hint.textContent).toBe('Set a budget');
      expect(hint.getAttribute('href')).toBe('/settings/categories');
      app?.unmount();
      money.budgetMode = 'all';
      el = await mount();
      expect(panel().querySelector('details')).toBeNull();
      expect(panel().querySelector('.desk-month-view-nobudget')).toBeNull();
      expect(panel().querySelectorAll('.desk-category-bars-row')).toHaveLength(3);
    });

    it('C4 the Table tab keeps every category', async () => {
      const el = await mount();
      (el.querySelectorAll('[data-panel="categories"] [role="tab"]')[1] as HTMLElement).click();
      await flush();
      expect(el.querySelectorAll('[data-panel="categories"] tbody tr')).toHaveLength(3);
    });

    it('C5 filters by text and category before the 8-row cut; the Entries tile keeps the count', async () => {
      money.rows = Array.from({ length: 12 }, (_, i) => ({
        id: `e${i + 1}`,
        description: i === 2 ? 'Taxi home' : `Item ${i + 1}`,
        date: '2026-10-02',
        categoryId: i < 6 ? 'c1' : 'c2',
        amountOriginal: 100,
        currencyOriginal: 'GBP',
      }));
      const el = await mount();
      expect(rows(el)).toHaveLength(8);
      await type(field(el, 'Filter entries'), 'TAXI');
      expect(rows(el)).toHaveLength(1);
      expect(
        [...el.querySelectorAll('.desk-month-view-stats [data-tile]')][2]!.textContent,
      ).toContain('12');
      await type(field(el, 'Filter entries'), '');
      const sel = field(el, 'Category');
      sel.value = 'c2';
      sel.dispatchEvent(new Event('change'));
      await flush();
      expect(rows(el)).toHaveLength(6);
      await type(field(el, 'Filter entries'), 'nothing like this');
      expect(rows(el)).toHaveLength(0);
      expect(el.textContent).toContain('No entries match');
    });

    it('C5 bulk delete: select two, confirm once, delete each, one grouped undo restores each', async () => {
      money.many = true;
      const el = await mount();
      const box = (name: string) =>
        el.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="Select ${name}"]`)!;
      expect(el.textContent).not.toContain('Delete selected');
      box('Shop').click();
      await nextTick();
      box('Item 2').click();
      await flush();
      const bulk = [...el.querySelectorAll('button')].find((b) =>
        /^Delete selected \(2\)$/.test(b.textContent?.trim() ?? ''),
      )!;
      bulk.click();
      await flush();
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain('2 entries');
      expect(await calls('DELETE')).toHaveLength(0);
      await confirmDelete();
      expect(await calls('DELETE')).toEqual(['/expenses/e1', '/expenses/e2']);
      const banners = [...el.querySelectorAll('.desk-undo-banner')];
      expect(banners).toHaveLength(1);
      expect(banners[0]!.textContent).toContain('Deleted 2 entries.');
      expect(el.textContent).not.toContain('Delete selected');
      [...banners[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Undo')!.click();
      await flush();
      expect(await calls('POST')).toEqual(['/expenses/e1/restore', '/expenses/e2/restore']);
    });

    it('C6 ? opens the shortcuts dialog; the buttons carry key hints; the kbd is not in the name', async () => {
      await mount();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      await flush();
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
        'Keyboard shortcuts',
      );
      const bar = document.querySelector('#top-bar-actions')!;
      const prev = bar.querySelector('button[aria-label="Previous month"]')!;
      const next = bar.querySelector('button[aria-label="Next month"]')!;
      expect(prev.getAttribute('aria-keyshortcuts')).toBe('[');
      expect(next.getAttribute('aria-keyshortcuts')).toBe(']');
      const add = bar.querySelector<HTMLButtonElement>('.desk-topbar-add')!;
      expect(add.getAttribute('aria-keyshortcuts')).toBe('n');
      expect(add.getAttribute('title')).toBe('Add expense (n)');
      expect(add.querySelector('kbd')!.getAttribute('aria-hidden')).toBe('true');
      const clone = add.cloneNode(true) as HTMLElement;
      clone.querySelector('kbd')!.remove();
      expect(clone.textContent!.trim()).toBe('Add expense');
    });

    it('C7 the undo banner stays for 10 s, not 6', async () => {
      const el = await mount();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
      el.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click();
      await vi.advanceTimersByTimeAsync(0);
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find((b) => b.textContent?.trim() === 'Delete')!
        .click();
      await vi.advanceTimersByTimeAsync(0);
      expect(el.querySelectorAll('.desk-undo-banner')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(9999);
      expect(el.querySelectorAll('.desk-undo-banner')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await nextTick();
      expect(el.querySelectorAll('.desk-undo-banner')).toHaveLength(0);
    });
  });
});

describe('MonthView month-load error (retry)', () => {
  it('offers Retry on the error panel and reloads the month when it is pressed', async () => {
    const { apiFetch, ApiError } = await import('../api/client.js');
    const mocked = vi.mocked(apiFetch);
    const impl = mocked.getMockImplementation()!;
    let failing = true;
    mocked.mockImplementation(async (path: string, init?: RequestInit) => {
      if (failing && path.startsWith('/expenses'))
        throw Object.assign(new ApiError('internal', 'boom', 500), { code: 'internal' });
      return impl(path, init);
    });
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: MonthView }],
    });
    const app = createApp(MonthView);
    app.use(router).use(createPinia());
    document.querySelector('#top-bar-actions')?.remove();
    const bar = document.createElement('div');
    bar.id = 'top-bar-actions';
    document.body.appendChild(bar);
    const el = document.createElement('div');
    document.body.appendChild(el);
    await router.push('/');
    app.mount(el);
    await flush();
    const retry = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Retry',
    )!;
    expect(retry).toBeTruthy();
    failing = false;
    retry.click();
    await flush();
    expect(el.querySelector('.desk-error-state')).toBeNull();
    expect(el.querySelector('[data-panel="entries"]')).not.toBeNull();
    app.unmount();
    mocked.mockImplementation(impl);
  });
});
