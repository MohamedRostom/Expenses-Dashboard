import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingView from './OnboardingView.vue';
import { useSessionStore } from '../stores/session.js';

const user = {
  id: '1',
  email: 'a@b.com',
  defaultCurrency: 'GBP',
  theme: 'system',
  timeZone: 'UTC',
};

async function mount() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      return Promise.resolve(
        new Response(JSON.stringify({ user: { ...user, ...body } }), { status: 200 }),
      );
    }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/add', name: 'add', component: { template: '<div>add</div>' } },
      {
        path: '/settings/connectors',
        name: 'settings-connectors',
        component: { template: '<div>connectors</div>' },
      },
      { path: '/onboarding', name: 'onboarding', component: OnboardingView },
    ],
  });
  // Same guard as router.ts: anything but onboarding bounces while onboardingCompletedAt is unset.
  router.beforeEach((to) => {
    const s = useSessionStore();
    if (!s.user?.onboardingCompletedAt && to.name !== 'onboarding') return { name: 'onboarding' };
    return true;
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().user = { ...user, onboardingCompletedAt: null } as never;
  await router.push('/onboarding');
  await router.isReady();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(OnboardingView);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return { el, router, app };
}

function click(el: HTMLElement, text: string) {
  const btn = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  btn!.click();
}

describe('OnboardingView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('Skip marks onboarding complete in the store and lands on home', async () => {
    const { el, router, app } = await mount();
    click(el, 'Skip');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'));
    expect(useSessionStore().user?.onboardingCompletedAt).toBeTruthy();
    app.unmount();
  });

  it('Connect Notion completes onboarding and reaches the connectors page', async () => {
    const { el, router, app } = await mount();
    click(el, 'Next');
    await vi.waitFor(() => expect(el.textContent).toContain('Step 2 of 3'));
    click(el, 'Next');
    await vi.waitFor(() => expect(el.textContent).toContain('Step 3 of 3'));
    click(el, 'Connect Notion');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings-connectors'));
    app.unmount();
  });
});
