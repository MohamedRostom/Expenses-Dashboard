import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../api/client.js', async (orig: () => Promise<Record<string, unknown>>) => ({
  ...(await orig()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));

import BinView from './BinView.vue';
import YearView from './YearView.vue';
import MonthCompare from '../components/MonthCompare.vue';
import { ApiError } from '../api/client.js';

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};
let app: ReturnType<typeof createApp> | undefined;
function mount(c: object) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const el = document.createElement('div');
  document.body.appendChild(el);
  app = createApp(c);
  app.use(pinia).mount(el);
  return el;
}
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
  apiFetch.mockReset();
});

describe('T040 data screens', () => {
  it('Bin rows restore through the Button block and the table is a captioned board', async () => {
    apiFetch.mockResolvedValue({
      expenses: [
        {
          id: 'e1',
          date: '2026-10-01',
          description: 'Coffee',
          amountOriginal: 350,
          currencyOriginal: 'GBP',
          deletedAt: '2026-10-02T00:00:00Z',
        },
      ],
    });
    const el = mount(BinView);
    await flush();
    expect(el.querySelector('caption')?.textContent).toContain('Bin');
    const restore = el.querySelector('button.desk-btn');
    expect(restore?.textContent?.trim()).toBe('Restore');
    expect(el.querySelector('td.desk-col--amount')?.textContent).toContain('3.50');
  });

  it('Bin error copy branches on the error code', async () => {
    apiFetch.mockRejectedValue(new ApiError('rate_limited', 'x', 429));
    const el = mount(BinView);
    await flush();
    expect(el.textContent).toContain('Slow down');
  });

  it('Month comparison is a labelled panel region', async () => {
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/categories')
          ? { categories: [{ id: 'c1', name: 'Groceries' }] }
          : { a: '2026-10', b: '2026-09', byCategory: [{ categoryId: 'c1', delta: 500 }] },
      ),
    );
    const el = mount(MonthCompare);
    await flush();
    expect(el.querySelector('section[role="region"] .desk-panel-frame-flap')).not.toBeNull();
    expect(el.textContent).toContain('Groceries');
  });

  it('Year view puts the total in the primary Tile', async () => {
    apiFetch.mockResolvedValue({
      year: 2026,
      currency: 'GBP',
      months: [{ month: '2026-10', spent: 4200, budgeted: 0 }],
    });
    const el = mount({
      components: { YearView },
      template: '<YearView />',
    });
    await flush();
    expect(el.querySelector('[data-tile-primary="figure"]')?.textContent).toContain('42');
  });
});
