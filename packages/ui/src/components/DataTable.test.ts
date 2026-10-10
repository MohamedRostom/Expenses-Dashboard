// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable.vue';

const categories = [
  { id: 'a', name: 'Rent', spent: 500, budget: 1000 },
  { id: 'b', name: 'Food', spent: 100, budget: null },
];

async function mount(props: Record<string, unknown> = {}) {
  const el = document.createElement('div');
  createApp({ render: () => h(DataTable, { categories, ...props }) }).mount(el);
  await nextTick();
  return el;
}

describe('DataTable', () => {
  it("renders today's markup by default: no caption, plain headers, no dense class", async () => {
    const el = await mount();
    expect(el.querySelector('caption')).toBeNull();
    expect(el.querySelector('th button')).toBeNull();
    expect(el.querySelector('table')?.classList.contains('desk-data-table--dense')).toBe(false);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('5.00');
  });

  it('renders a caption', async () => {
    const el = await mount({ caption: 'Spend by category' });
    expect(el.querySelector('caption')?.textContent).toBe('Spend by category');
  });

  it('adds the dense class', async () => {
    const el = await mount({ dense: true });
    expect(el.querySelector('table')?.classList.contains('desk-data-table--dense')).toBe(true);
  });

  it('sortable headers are buttons with aria-sort and toggle on click', async () => {
    const el = await mount({ sortable: true });
    const ths = [...el.querySelectorAll('thead th')];
    expect(ths.every((th) => th.querySelector('button'))).toBe(true);
    expect(ths.map((th) => th.getAttribute('aria-sort'))).toEqual(['none', 'none', 'none', 'none']);
    ths[1]!.querySelector('button')!.click();
    await nextTick();
    expect(el.querySelectorAll('thead th')[1]!.getAttribute('aria-sort')).toBe('ascending');
    // ascending by spent: Food (100) before Rent (500)
    expect(el.querySelector('tbody th')?.textContent).toBe('Food');
    el.querySelectorAll('thead th')[1]!.querySelector('button')!.click();
    await nextTick();
    expect(el.querySelectorAll('thead th')[1]!.getAttribute('aria-sort')).toBe('descending');
    expect(el.querySelector('tbody th')?.textContent).toBe('Rent');
  });
});

describe('DataTable board mode (T032)', () => {
  it('renders the given columns as heads and the default slot as the body', async () => {
    const el = document.createElement('div');
    createApp({
      render: () =>
        h(
          DataTable,
          {
            categories: [],
            caption: 'Entries',
            columns: [
              { key: 'date', label: 'Date' },
              { key: 'amount', label: 'Amount', align: 'end' },
            ],
          },
          { default: () => h('tr', [h('td', '15 Sep'), h('td', '£1.00')]) },
        ),
    }).mount(el);
    await nextTick();
    expect([...el.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual([
      'Date',
      'Amount',
    ]);
    expect(el.querySelector('caption')?.textContent).toBe('Entries');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
