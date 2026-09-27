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
    await vi.waitFor(() => expect(el.textContent).toContain('a@b.com'));

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

describe('ConnectionsView — account card (T062)', () => {
  const GOOGLE_PROVIDER = { id: 'google', capabilities: ['calendar', 'mail'] };
  const BASE_ACCOUNT = {
    id: 'acc-2',
    provider: 'google',
    address: 'work@example.com',
    label: 'Work',
    colour: 'teal',
    capabilities: ['calendar'],
    grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    status: 'connected',
    pausedAt: null,
    lastRefreshAt: '2026-09-27T08:00:00Z',
    lastError: null,
    calendars: [
      { id: 'cal-1', name: 'Primary', isPrimary: true, enabled: true },
      { id: 'cal-2', name: 'Holidays', isPrimary: false, enabled: false },
    ],
  };

  function fetchMockWithAccount(
    account: Record<string, unknown>,
    handlers: Record<string, (init?: RequestInit) => Response> = {},
  ) {
    return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const key = `${method} ${url}`;
      if (handlers[key]) return Promise.resolve(handlers[key](init));
      if (url === '/connections/providers') {
        return Promise.resolve(
          new Response(JSON.stringify({ providers: [GOOGLE_PROVIDER] }), { status: 200 }),
        );
      }
      if (url === '/connections') {
        return Promise.resolve(
          new Response(JSON.stringify({ accounts: [account], limit: 10 }), { status: 200 }),
        );
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });
  }

  async function mountWithSearch(search: string) {
    // The component reads query params off the real browser location (window.location.search),
    // same as the ?reconnect=<id> flow above — a memory-history router.push never touches that.
    window.history.pushState({}, '', '/settings/connections' + search);
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

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/settings/connections');
  });

  it('edits the label and saves it via PATCH', async () => {
    const patchCalls: unknown[] = [];
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT, {
      'PATCH /connections/acc-2': (init) => {
        patchCalls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ account: { ...BASE_ACCOUNT, label: 'Work mail' } }), {
          status: 200,
        });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const labelInput = el.querySelector<HTMLInputElement>('input[aria-label="Account label"]');
    expect(labelInput).not.toBeNull();
    labelInput!.value = 'Work mail';
    labelInput!.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(patchCalls).toEqual([{ label: 'Work mail' }]));
    app.unmount();
  });

  it('renders an eight-colour radio group, named, operable with arrow keys, and PATCHes the choice', async () => {
    const patchCalls: unknown[] = [];
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT, {
      'PATCH /connections/acc-2': (init) => {
        patchCalls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ account: BASE_ACCOUNT }), { status: 200 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const group = el.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    const radios = [...el.querySelectorAll('[role="radio"]')];
    expect(radios).toHaveLength(8);
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Teal',
      'Blue',
      'Violet',
      'Pink',
      'Orange',
      'Amber',
      'Green',
      'Slate',
    ]);
    const checkedIndex = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    expect(checkedIndex).toBe(0); // teal, matches BASE_ACCOUNT.colour

    (radios[0] as HTMLElement).focus();
    (radios[0] as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await nextTick();

    expect(document.activeElement).toBe(radios[1]);
    await vi.waitFor(() => expect(patchCalls).toEqual([{ colour: 'blue' }]));
    app.unmount();
  });

  it('pauses and resumes via PATCH', async () => {
    const patchCalls: unknown[] = [];
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT, {
      'PATCH /connections/acc-2': (init) => {
        const parsed = JSON.parse(String(init?.body));
        patchCalls.push(parsed);
        return new Response(
          JSON.stringify({
            account: { ...BASE_ACCOUNT, pausedAt: '2026-09-27T09:00:00Z', status: 'paused' },
          }),
          { status: 200 },
        );
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const pauseBtn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Pause',
    );
    expect(pauseBtn).toBeDefined();
    pauseBtn!.click();

    await vi.waitFor(() => expect(patchCalls).toEqual([{ paused: true }]));
    await vi.waitFor(() => expect(el.textContent).toContain('Resume'));
    app.unmount();
  });

  it('toggles a calendar in the checklist via PATCH', async () => {
    const patchCalls: unknown[] = [];
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT, {
      'PATCH /connections/acc-2': (init) => {
        patchCalls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ account: BASE_ACCOUNT }), { status: 200 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('Holidays'));

    const checkbox = el.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="Holidays"]',
    );
    expect(checkbox).not.toBeNull();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));

    await vi.waitFor(() =>
      expect(patchCalls).toEqual([{ calendars: [{ id: 'cal-2', enabled: true }] }]),
    );
    app.unmount();
  });

  it('shows an "Add mail" button for a capability the provider offers but the account lacks', async () => {
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT);
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const addMailLink = el.querySelector<HTMLAnchorElement>('a[href^="/connections/google/start"]');
    expect(addMailLink).not.toBeNull();
    expect(addMailLink!.getAttribute('href')).toBe(
      '/connections/google/start?capabilities=mail&account=acc-2',
    );
    expect(addMailLink!.textContent).toContain('Add mail');
    app.unmount();
  });

  it('shows the mapped ?error=<code> banner text', async () => {
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT);
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('?error=limit_reached');
    await vi.waitFor(() =>
      expect(el.textContent).toContain(
        'You can connect up to 10 accounts. Disconnect one to add another.',
      ),
    );
    app.unmount();
  });

  it('shows the ?connected=<id> card listing granted capabilities and scopes', async () => {
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT);
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('?connected=acc-2');
    await vi.waitFor(() => expect(el.textContent).toContain('calendar'));
    expect(el.textContent).toContain('https://www.googleapis.com/auth/calendar.readonly');
    app.unmount();
  });

  it('shows mapped last-error copy, not the raw code', async () => {
    const account = { ...BASE_ACCOUNT, status: 'reconnect_needed', lastError: 'access_revoked' };
    const fetchMock = fetchMockWithAccount(account);
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() =>
      expect(el.textContent).toContain(
        'Access was revoked at the provider. Reconnect to keep this account working.',
      ),
    );
    expect(el.textContent).not.toContain('access_revoked');
    app.unmount();
  });

  it('disconnect asks for confirmation in an in-page dialog, naming what is removed, before calling DELETE', async () => {
    const deleteCalls: string[] = [];
    const fetchMock = fetchMockWithAccount(BASE_ACCOUNT, {
      'DELETE /connections/acc-2': () => {
        deleteCalls.push('acc-2');
        return new Response(null, { status: 204 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const disconnectBtn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Disconnect',
    );
    disconnectBtn!.click();
    await nextTick();

    const dialog = el.querySelector('dialog, [role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('work@example.com');
    expect(deleteCalls).toEqual([]);

    const confirmBtn = [...dialog!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Disconnect',
    );
    confirmBtn!.click();

    await vi.waitFor(() => expect(deleteCalls).toEqual(['acc-2']));
    app.unmount();
  });

  it('shows Microsoft revoke instructions from privacy-text.ts before disconnecting a Microsoft account', async () => {
    const msAccount = { ...BASE_ACCOUNT, id: 'acc-3', provider: 'microsoft' };
    const fetchMock = fetchMockWithAccount(msAccount, {
      'DELETE /connections/acc-3': () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = await mountWithSearch('');
    await vi.waitFor(() => expect(el.textContent).toContain('work@example.com'));

    const disconnectBtn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Disconnect',
    );
    disconnectBtn!.click();
    await nextTick();

    const dialog = el.querySelector('dialog, [role="dialog"]');
    expect(dialog!.textContent).toContain('account.microsoft.com/privacy');
    app.unmount();
  });
});
