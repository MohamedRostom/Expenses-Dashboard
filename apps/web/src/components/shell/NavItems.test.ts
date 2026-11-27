import { describe, expect, it } from 'vitest';
import source from './NavItems.vue?raw';

describe('NavItems selected item', () => {
  it('keeps a visible marker under forced colours, where the background is removed', () => {
    const block = /@media \(forced-colors: active\)\s*\{([\s\S]*?\n)\}/.exec(source);
    expect(block, '@media (forced-colors: active) block').not.toBeNull();
    const rule = /\.nav-item\[aria-current='page'\]\s*\{([^}]*)\}/.exec(block![1]!);
    expect(rule, "rule for .nav-item[aria-current='page'] inside it").not.toBeNull();
    expect(rule![1]).toMatch(/outline:\s*2px solid Highlight/);
    expect(rule![1]).toMatch(/outline-offset:\s*-2px/);
  });
});

describe('NavItems middle slot (the bottom bar Add)', () => {
  it.each([false, true])('always follows Year, whether panels.today is %s', async (today) => {
    const { createPinia, setActivePinia } = await import('pinia');
    const { createApp, h } = await import('vue');
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const { useFlagsStore } = await import('../../stores/flags.js');
    const NavItems = (await import('./NavItems.vue')).default;

    const pinia = createPinia();
    setActivePinia(pinia);
    useFlagsStore().flags = { 'panels.today': today };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['/', '/year', '/today', '/settings'].map((path) => ({
        path,
        component: { render: () => null },
      })),
    });
    await router.push('/');
    await router.isReady();
    const el = document.createElement('div');
    const app = createApp({
      render: () => h(NavItems, null, { middle: () => h('i', { id: 'add' }) }),
    });
    app.use(pinia).use(router).mount(el);

    const order = [...el.querySelector('nav')!.children].map((c) => c.id || c.textContent!.trim());
    expect(order[order.indexOf('Year') + 1]).toBe('add');
    app.unmount();
  });
});
