import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResetView from './ResetView.vue';

describe('ResetView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('sits in a .surface panel, max 28rem wide, with no fixed width so it reflows at 360', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
    });
    await router.push('/?token=t');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(ResetView);
    app.use(pinia);
    app.use(router);
    app.mount(el);
    await nextTick();

    const panel = el.querySelector('main.surface') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('form')).not.toBeNull();
    const style = getComputedStyle(panel);
    expect(style.maxWidth).toBe('448px'); // 28rem, as jsdom resolves it
    // No fixed width: it shrinks with the viewport instead of overflowing at 360.
    expect(style.width).not.toMatch(/^\d+px$/);
  });
});
