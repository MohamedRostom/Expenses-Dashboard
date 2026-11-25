import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client.js';
import YearView from './YearView.vue';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(),
}));

const months = (spent: Record<number, number>) =>
  Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    spent: spent[i + 1] ?? 0,
    budgeted: 0,
  }));

function serve(spent: Record<number, number>) {
  vi.mocked(apiFetch).mockImplementation((async (url: string) => {
    if (url.startsWith('/summary/year'))
      return { year: '2026', currency: 'GBP', months: months(spent) };
    return { categories: [], byCategory: [] };
  }) as never);
}

async function mount() {
  document.querySelector('#top-bar-actions')?.remove();
  const bar = document.createElement('div');
  bar.id = 'top-bar-actions';
  document.body.appendChild(bar);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(YearView);
  app.use(createPinia());
  app.mount(el);
  await vi.waitFor(() => expect(el.querySelector('[data-tile], .desk-empty-state')).not.toBeNull());
  return { el, app };
}

describe('YearView summary tiles', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
  });

  it('shows Year total, Monthly average and Highest month for a known year', async () => {
    serve({ 1: 10000, 3: 30000, 6: 20000 });
    const m = await mount();
    app = m.app;
    const tiles = [...m.el.querySelectorAll('[data-tile]')];
    expect(tiles).toHaveLength(3);
    const text = tiles.map((t) => t.textContent ?? '');
    expect(text[0]).toContain('Year total');
    expect(text[0]).toContain('£600.00');
    expect(text[1]).toContain('Monthly average');
    expect(text[1]).toContain('£200.00');
    expect(text[1]).toContain('Over 3 months with spend');
    expect(text[2]).toContain('Highest month');
    expect(text[2]).toContain('Mar');
    expect(text[2]).toContain('£300.00');
  });

  it('shows only the empty state when nothing was spent', async () => {
    serve({});
    const m = await mount();
    app = m.app;
    expect(m.el.querySelectorAll('[data-tile]')).toHaveLength(0);
    expect(m.el.textContent).toContain('No expenses this year');
  });
});

describe('YearView top bar and table (finish review)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
  });

  it('puts the year switcher in the top bar actions, with chevron buttons labelled by year', async () => {
    serve({ 1: 10000 });
    const m = await mount();
    app = m.app;
    const bar = document.querySelector('#top-bar-actions')!;
    expect(m.el.querySelector('.desk-year-switcher')).toBeNull();
    expect(bar.querySelector('button[aria-label="Previous year"] svg')).not.toBeNull();
    expect(bar.querySelector('button[aria-label="Next year"] svg')).not.toBeNull();
    expect(bar.querySelector('.desk-year-label')?.textContent).toMatch(/^\d{4}$/);
  });

  it('shows the table month as "Jan 2026"', async () => {
    serve({ 1: 10000 });
    const m = await mount();
    app = m.app;
    expect(m.el.querySelector('.desk-year-bars-table tbody th')?.textContent).toBe('Jan 2026');
  });
});
