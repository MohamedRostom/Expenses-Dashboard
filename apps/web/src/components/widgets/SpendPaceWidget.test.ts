import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick, type Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetT } from '@desk/contracts';

vi.mock('../../api/client.js', () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }));

type Figures = NonNullable<Extract<WidgetT, { kind: 'spend_pace' }>['figures']>;
const BASE: Figures = {
  spentMinor: 62000,
  budgetMinor: 100000,
  pct: 62,
  daysLeft: 9,
  dailyToBudgetMinor: 4222,
  overBudget: false,
};

async function mount(figures: Figures) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useSessionStore } = await import('../../stores/session.js');
  useSessionStore().user = { defaultCurrency: 'GBP' } as never;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/categories', component: {} as Component }],
  });
  const { default: W } = await import('./SpendPaceWidget.vue');
  const el = document.createElement('div');
  createApp(W, { figures }).use(pinia).use(router).mount(el);
  await nextTick();
  return el;
}

describe('SpendPaceWidget', () => {
  it('shows spent, budget, percent, days left and daily amount', async () => {
    const el = await mount(BASE);
    const text = el.textContent ?? '';
    expect(text).toContain('£620.00 GBP');
    expect(text).toContain('£1,000.00 GBP');
    expect(text).toContain('62%');
    expect(text).toContain('9 days left');
    expect(text).toContain('£42.22 GBP');
    expect(el.querySelector('.desk-spend-pace-num')).not.toBeNull();
    expect(el.querySelector('.desk-over')).toBeNull();
  });

  it('marks over budget with the critical class', async () => {
    const el = await mount({
      ...BASE,
      spentMinor: 120000,
      pct: 120,
      overBudget: true,
      dailyToBudgetMinor: 0,
    });
    expect(el.querySelector('.desk-over')).not.toBeNull();
  });

  it('links to categories when there is no budget', async () => {
    const el = await mount({ ...BASE, budgetMinor: null, pct: null, dailyToBudgetMinor: null });
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/categories');
    expect(el.textContent).toContain('£620.00 GBP');
  });
});
