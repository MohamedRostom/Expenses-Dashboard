import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginView from './LoginView.vue';

describe('LoginView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('calls /auth/login with the entered credentials on submit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ user: { id: '1', email: 'a@b.com' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/login', name: 'login', component: LoginView },
      ],
    });
    await router.push('/login');
    await router.isReady();

    const el = document.createElement('div');
    document.body.appendChild(el);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(LoginView);
    app.use(pinia);
    app.use(router);
    app.mount(el);
    await nextTick();

    const emailInput = el.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = el.querySelector('input[type="password"]') as HTMLInputElement;
    emailInput.value = 'a@b.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'secretpassword';
    passwordInput.dispatchEvent(new Event('input'));
    await nextTick();

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/auth/login');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'a@b.com',
      password: 'secretpassword',
    });

    app.unmount();
  });
});

describe('LoginView error copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function failWith(status: number, code: string) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code, message: 'x' } }), { status }),
        ),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', name: 'login', component: LoginView }],
    });
    await router.push('/login');
    await router.isReady();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(LoginView);
    app.use(pinia);
    app.use(router);
    app.mount(el);
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]')).not.toBeNull());
    const text = el.querySelector('[role="alert"]')!.textContent ?? '';
    app.unmount();
    return text;
  }

  it('gives each cause its own copy, not one generic banner', async () => {
    const wrong = await failWith(401, 'unauthenticated');
    const limited = await failWith(429, 'rate_limited');
    const unverified = await failWith(403, 'email_unverified');
    const other = await failWith(500, 'internal');
    expect(wrong).toContain('Wrong email or password');
    expect(limited).toContain('Too many attempts');
    expect(unverified).toContain('Confirm your email');
    expect(new Set([wrong, limited, unverified, other]).size).toBe(4);
    expect(wrong).not.toContain('Sign in required');
  });

  it('renders exactly one main landmark', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: LoginView }],
    });
    const app = createApp(LoginView);
    app.use(pinia);
    app.use(router);
    app.mount(el);
    await nextTick();
    expect(el.querySelectorAll('main').length).toBe(1);
    app.unmount();
  });
});
