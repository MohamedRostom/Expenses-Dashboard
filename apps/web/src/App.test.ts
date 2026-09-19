import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useSessionStore } from './stores/session.js';

const stub = { template: '<div />' };

async function mount(path: string, signedIn: boolean) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: stub },
      { path: '/', name: 'home', component: stub, meta: { requiresAuth: true } },
      { path: '/year', name: 'year', component: stub, meta: { requiresAuth: true } },
      { path: '/categories', name: 'categories', component: stub, meta: { requiresAuth: true } },
      { path: '/settings', name: 'settings', component: stub, meta: { requiresAuth: true } },
      { path: '/onboarding', name: 'onboarding', component: stub, meta: { requiresAuth: true } },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  if (signedIn) useSessionStore().user = { id: '1', email: 'a@b.com' } as never;
  await router.push(path);
  await router.isReady();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(App);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return { el, app };
}

describe('App nav', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('links to settings on signed-in app screens', async () => {
    const { el, app } = await mount('/', true);
    expect(el.querySelector('nav a[href="/settings"]')).not.toBeNull();
    app.unmount();
  });

  it('is hidden on auth pages and during onboarding', async () => {
    for (const [path, signedIn] of [
      ['/login', false],
      ['/onboarding', true],
    ] as const) {
      const { el, app } = await mount(path, signedIn);
      expect(el.querySelector('nav')).toBeNull();
      app.unmount();
      document.body.innerHTML = '';
    }
  });
});
