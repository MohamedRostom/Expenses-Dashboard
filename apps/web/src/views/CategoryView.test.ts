import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoryView from './CategoryView.vue';

vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async () => ({
    months: [
      { month: '2026-09', spent: 0, budget: null },
      { month: '2026-10', spent: 0, budget: null },
    ],
  })),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('CategoryView empty history (review2)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => app?.unmount());

  it('explains the empty state and offers exactly one action: Add an expense', async () => {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings/categories/:id', component: CategoryView },
        { path: '/add', component: { template: '<div />' } },
      ],
    });
    app = createApp(CategoryView);
    app.use(router).use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    await router.push('/settings/categories/c1');
    app.mount(el);
    await flush();
    expect(el.querySelector('.desk-panel-frame')).not.toBeNull();
    const empty = el.querySelector('.desk-empty-state')!;
    expect(empty.textContent).toContain('No spend recorded');
    expect(empty.querySelector('.desk-empty-desc')).not.toBeNull();
    const actions = empty.querySelectorAll('a, button');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.textContent).toBe('Add an expense');
    (actions[0] as HTMLElement).click();
    await flush();
    expect(router.currentRoute.value.path).toBe('/add');
  });
});
