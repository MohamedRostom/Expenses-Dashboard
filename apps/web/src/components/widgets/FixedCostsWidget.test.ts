import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetT } from '@desk/contracts';

vi.mock('../../api/client.js', () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }));

type Figures = NonNullable<Extract<WidgetT, { kind: 'fixed_costs' }>['figures']>;

async function mount(figures: Figures) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useSessionStore } = await import('../../stores/session.js');
  useSessionStore().user = { defaultCurrency: 'GBP' } as never;
  const { default: W } = await import('./FixedCostsWidget.vue');
  const el = document.createElement('div');
  createApp(W, { figures }).use(pinia).mount(el);
  await nextTick();
  return el;
}

describe('FixedCostsWidget', () => {
  it('lists remaining categories by basis and the expected total', async () => {
    const el = await mount({
      remaining: [
        { categoryId: 'a', name: 'Internet', usualMinor: 3000, usualBasis: 'previous' },
        { categoryId: 'b', name: 'Rent', usualMinor: 90000, usualBasis: 'budget' },
        { categoryId: 'c', name: 'Phone', usualMinor: null, usualBasis: 'none' },
      ],
      totalExpectedMinor: 93000,
      allRecorded: false,
    });
    const rows = [...el.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('Internet');
    expect(rows[0]).toContain('about £30.00 GBP');
    expect(rows[1]).toContain('Rent');
    expect(rows[1]).toContain('£900.00 GBP');
    expect(rows[1]).not.toContain('about');
    expect(rows[2]).toContain('no usual amount yet');
    expect(el.textContent).toContain('£930.00 GBP');
  });

  it('says all fixed costs are in when everything is recorded', async () => {
    const el = await mount({ remaining: [], totalExpectedMinor: 0, allRecorded: true });
    expect(el.textContent).toMatch(/all fixed costs are in/i);
    expect(el.textContent).toContain('£0.00 GBP');
  });
});
