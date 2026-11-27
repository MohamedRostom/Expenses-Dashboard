import { createApp } from 'vue';
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

function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(ConnectorsView).mount(el);
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
    const el = mount();
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
    const el = mount();
    await vi.waitFor(() => expect(el.querySelector('[aria-busy="true"]')).not.toBeNull());
  });

  it('503 feature_unavailable: unavailable copy, Connect disabled, no toast', async () => {
    apiFetch.mockRejectedValue(await apiError('feature_unavailable', 503));
    const el = mount();
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
    const el = mount();
    await vi.waitFor(() => expect(el.textContent).toContain('Connect a Notion workspace'));
    const connect = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Connect Notion'),
    );
    expect(connect?.disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
