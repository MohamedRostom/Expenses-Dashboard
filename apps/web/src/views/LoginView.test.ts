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
