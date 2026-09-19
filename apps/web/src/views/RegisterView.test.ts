import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterView from './RegisterView.vue';

describe('RegisterView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('registers and shows the check-your-email state on 202', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/currencies') {
        return Promise.resolve(new Response(JSON.stringify({ currencies: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 202 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const pinia = createPinia();
    setActivePinia(pinia);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(RegisterView);
    app.use(pinia);
    app.mount(el);
    await nextTick();

    (el.querySelector('input[type="email"]') as HTMLInputElement).value = 'a@b.com';
    el.querySelector('input[type="email"]')!.dispatchEvent(new Event('input'));
    (el.querySelector('input[type="password"]') as HTMLInputElement).value = 'secretpassword12';
    el.querySelector('input[type="password"]')!.dispatchEvent(new Event('input'));
    await nextTick();

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[0] === '/auth/register')).toBe(true),
    );

    const registerCall = fetchMock.mock.calls.find((c) => c[0] === '/auth/register')!;
    const body = JSON.parse((registerCall[1] as RequestInit).body as string);
    expect(body.email).toBe('a@b.com');
    expect(body.password).toBe('secretpassword12');
    expect(typeof body.defaultCurrency).toBe('string');

    await vi.waitFor(() => expect(el.textContent).toContain('Check your email'));

    app.unmount();
  });

  it('shows the API reason on the password field when register returns 400', async () => {
    const body = {
      error: {
        code: 'validation_failed',
        message: 'This password has appeared in a data breach',
        details: { password: 'breached' },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(
            url === '/currencies'
              ? new Response(JSON.stringify({ currencies: [] }), { status: 200 })
              : new Response(JSON.stringify(body), { status: 400 }),
          ),
        ),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(RegisterView);
    app.use(pinia);
    app.mount(el);
    await nextTick();

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(el.textContent).toContain('This password has appeared in a data breach'),
    );
    expect(el.querySelector('input[type="password"]')!.classList.contains('invalid')).toBe(true);

    app.unmount();
  });
});
