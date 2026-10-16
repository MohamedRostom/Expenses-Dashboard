import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import appSource from './App.vue?raw';
import feedbackSource from './components/FeedbackWidget.vue?raw';
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
      {
        path: '/settings/categories',
        name: 'categories',
        component: stub,
        meta: { requiresAuth: true },
      },
      { path: '/settings', name: 'settings', component: stub, meta: { requiresAuth: true } },
      {
        path: '/settings/connectors',
        name: 'settings-connectors',
        component: stub,
        meta: { requiresAuth: true },
      },
      { path: '/import', name: 'import', component: stub, meta: { requiresAuth: true } },
      { path: '/bin', name: 'bin', component: stub, meta: { requiresAuth: true } },
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

  it('wraps instead of overflowing at phone width (7 links + Sign out never fit one 390px row)', async () => {
    const { el, app } = await mount('/', true);
    const nav = el.querySelector('nav') as HTMLElement;
    expect(getComputedStyle(nav).flexWrap).toBe('wrap');
    app.unmount();
  });

  it('marks the current link aria-current=page and never colours link text with the accent', async () => {
    const { el, app } = await mount('/', true);
    const current = el.querySelectorAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toBe('Month');
    // Class contract (CSS is not applied in jsdom): no nav rule sets the accent as text colour;
    // the current link uses the accent only for its 2px underline.
    const rules = appSource.match(/\.desk-nav[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).not.toMatch(/(^|[;{\s])color:\s*var\(--color-accent\)/);
    expect(appSource).toMatch(/border-bottom-color:\s*var\(--color-accent\)/);
    app.unmount();
  });

  it('draws the Feedback trigger with the Button block and no literal colours (dark contrast)', async () => {
    const { el, app } = await mount('/', true);
    const trigger = el.querySelector('.feedback-widget button') as HTMLElement;
    expect(trigger.classList.contains('desk-btn')).toBe(true);
    expect(trigger.classList.contains('secondary')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await nextTick();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const controls = trigger.getAttribute('aria-controls')!;
    expect(el.querySelector(`#${controls}`)).not.toBeNull();
    expect(appSource).toMatch(
      /\.desk-header\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border\)/,
    );
    expect(feedbackSource).not.toMatch(/2713/);
    expect(feedbackSource).not.toMatch(/color:\s*white|rgba?\(/);
    expect(feedbackSource).toMatch(/--shadow-overlay/);
    expect(feedbackSource).toMatch(/--shadow-raised/);
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
