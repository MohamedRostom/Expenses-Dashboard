import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConnectionsView from './ConnectionsView.vue';

const ACCOUNT = {
  id: 'acc-1',
  provider: 'google',
  address: 'a@b.com',
  label: 'Personal',
  colour: 'teal',
  capabilities: ['calendar'],
  grantedScopes: [],
  status: 'reconnect_needed',
  pausedAt: null,
  lastRefreshAt: null,
  lastError: 'access_revoked',
  calendars: [],
};

function fetchMockFor(reconnectResponse: unknown) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/connections/providers') {
      return Promise.resolve(new Response(JSON.stringify({ providers: [] }), { status: 200 }));
    }
    if (url === '/connections') {
      return Promise.resolve(
        new Response(JSON.stringify({ accounts: [ACCOUNT], limit: 10 }), { status: 200 }),
      );
    }
    if (url === '/connections/acc-1/reconnect' && (init?.method ?? 'GET') === 'POST') {
      return Promise.resolve(new Response(JSON.stringify(reconnectResponse), { status: 200 }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/connections', name: 'settings-connections', component: ConnectionsView },
    ],
  });
  await router.push('/settings/connections');
  await router.isReady();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(ConnectionsView);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return { el, app };
}

const realLocation = window.location;

/** Spies on `location.href = ...` while keeping `search`/`pathname` live off the real
 * Location object, so a component's `history.replaceState` during the test is still visible. */
function spyOnHrefAssignment(): ReturnType<typeof vi.fn> {
  const assignSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new Proxy(realLocation, {
      set(target, prop, value) {
        if (prop === 'href') {
          assignSpy(value);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
      get(target, prop) {
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  });
  return assignSpy;
}

describe('ConnectionsView — ?reconnect=<id>', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    window.history.replaceState({}, '', '/settings/connections');
  });

  it('starts the reconnect flow and navigates to the returned url for a known account, then strips the query param', async () => {
    const fetchMock = fetchMockFor({ url: 'https://accounts.google.com/o/oauth2/consent' });
    vi.stubGlobal('fetch', fetchMock);
    const assignSpy = spyOnHrefAssignment();

    window.history.pushState({}, '', '/settings/connections?reconnect=acc-1');
    const { app } = await mount();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/connections/acc-1/reconnect', expect.anything()),
    );
    await vi.waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/consent'),
    );
    expect(window.location.search).toBe('');

    app.unmount();
  });

  it('opens the password step for a standards account that needs a new app password', async () => {
    const fetchMock = fetchMockFor({ needsPassword: true });
    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', '/settings/connections?reconnect=acc-1');
    const { el, app } = await mount();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/connections/acc-1/reconnect', expect.anything()),
    );
    await vi.waitFor(() => expect(el.textContent).toContain('new app password'));
    expect(window.location.search).toBe('');

    app.unmount();
  });

  it('ignores a reconnect query param that names no account of the user', async () => {
    const fetchMock = fetchMockFor({ url: 'https://accounts.google.com/o/oauth2/consent' });
    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', '/settings/connections?reconnect=unknown-id');
    const { app } = await mount();
    await nextTick();

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/connections/unknown-id/reconnect',
      expect.anything(),
    );
    app.unmount();
  });

  it('the Reconnect button on an account card triggers the same flow', async () => {
    const fetchMock = fetchMockFor({ url: 'https://accounts.google.com/o/oauth2/consent' });
    vi.stubGlobal('fetch', fetchMock);
    const assignSpy = spyOnHrefAssignment();

    const { el, app } = await mount();
    await vi.waitFor(() => expect(el.textContent).toContain('Personal'));

    const btn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Reconnect',
    );
    btn!.click();

    await vi.waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/consent'),
    );
    app.unmount();
  });
});
