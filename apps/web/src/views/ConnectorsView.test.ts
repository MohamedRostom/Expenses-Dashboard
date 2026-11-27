import { createApp } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Static import: a cold import inside the test was charged to its 5 s timeout under full load.
import ConnectorsView from './ConnectorsView.vue';

const push = vi.fn();
vi.mock('@desk/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useToast: () => ({ push }),
}));

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../api/client.js', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return { apiFetch, ApiError };
});

async function apiError(code: string, status: number) {
  const { ApiError } = await import('../api/client.js');
  return new ApiError(code as never, 'server said so', status);
}

let router: Router;
async function mount(query: Record<string, string> = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ConnectorsView }],
  });
  await router.push({ path: '/', query });
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(ConnectorsView).use(router).mount(el);
  return el;
}

beforeEach(() => {
  push.mockClear();
  apiFetch.mockReset();
});

describe('ConnectorsView board look (spec 006 T050c)', () => {
  it('puts the connection status and sync controls inside PanelFrames', async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url === '/notion/connection'
        ? {
            connection: {
              status: 'connected',
              direction: 'both',
              workspaceName: 'W',
              lastSyncAt: null,
            },
          }
        : { databases: [] },
    );
    const el = await mount();
    expect(el.querySelector('h1')).toBeNull();
    await vi.waitFor(() =>
      expect(
        [...el.querySelectorAll('.desk-panel-frame')].map(
          (f) => f.querySelector('h3')?.textContent,
        ),
      ).toEqual(['Connection', 'Sync']),
    );
  });
});

describe('ConnectorsView load states (spec 005 T012)', () => {
  it('shows a skeleton while the request is pending', async () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    const el = await mount();
    await vi.waitFor(() => expect(el.querySelector('[aria-busy="true"]')).not.toBeNull());
  });

  it('503 feature_unavailable: unavailable copy, Connect disabled, no toast', async () => {
    apiFetch.mockRejectedValue(await apiError('feature_unavailable', 503));
    const el = await mount();
    await vi.waitFor(() =>
      expect(el.textContent).toContain("Notion sync isn't available on this server yet."),
    );
    const connect = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Connect Notion'),
    );
    expect(connect?.disabled).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('404 not_found: not-connected state, Connect enabled', async () => {
    apiFetch.mockRejectedValue(await apiError('not_found', 404));
    const el = await mount();
    await vi.waitFor(() => expect(el.textContent).toContain('Connect a Notion workspace'));
    const connect = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Connect Notion'),
    );
    expect(connect?.disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('ConnectorsView connect outcomes (spec 005 T028)', () => {
  const notConnected = async () => apiFetch.mockRejectedValue(await apiError('not_found', 404));
  const cases: [string, string, string | null][] = [
    ['connected', 'Connected to Notion', null],
    ['no_pages', 'No pages were shared with Desk', 'Reconnect to choose pages'],
    ['denied', "Notion wasn't connected", 'Try again'],
    ['expired', 'That connection attempt expired', 'Try again'],
    ['failed', "Couldn't connect to Notion", 'Try again'],
    ['unavailable', "Notion sync isn't available on this server yet.", null],
  ];
  it.each(cases)('?notion=%s shows its copy and drops the parameter', async (o, copy, action) => {
    await notConnected();
    const el = await mount({ notion: o });
    await vi.waitFor(() => expect(el.textContent).toContain(copy));
    await vi.waitFor(() => expect(router.currentRoute.value.query.notion).toBeUndefined());
    if (action)
      expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes(action))).toBe(
        true,
      );
    if (o === 'denied') expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
  it('ignores an invalid value', async () => {
    await notConnected();
    const el = await mount({ notion: 'bogus' });
    await vi.waitFor(() => expect(el.textContent).toContain('Connect a Notion workspace'));
    expect(el.textContent).not.toContain('bogus');
  });
  it('announces the outcome in its own status region and the state in the sr-only one', async () => {
    await notConnected();
    const el = await mount({ notion: 'denied' });
    await vi.waitFor(() => expect(el.textContent).toContain('Connect a Notion workspace'));
    const regions = [...el.querySelectorAll('[role="status"]')].map((r) => r.textContent?.trim());
    expect(regions.some((r) => r?.startsWith("Notion wasn't connected."))).toBe(true);
    expect(regions).toContain('Notion is not connected.');
    expect(
      el.querySelector('.desk-connectors-notice')!.closest('.desk-panel-frame'),
    ).not.toBeNull();
  });
  it('reconnect_needed status renders the Reconnect Notion state', async () => {
    apiFetch.mockResolvedValue({
      connection: { status: 'reconnect_needed', direction: 'both', workspaceName: 'W' },
    });
    const el = await mount();
    await vi.waitFor(() => expect(el.textContent).toContain('Reconnect Notion'));
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Reconnect Notion')),
    ).toBe(true);
  });
});
