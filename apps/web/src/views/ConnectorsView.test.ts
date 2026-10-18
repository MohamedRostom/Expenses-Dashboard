import { createApp } from 'vue';
import { describe, expect, it, vi } from 'vitest';
// Static import: a cold import inside the test was charged to its 5 s timeout under full load.
import ConnectorsView from './ConnectorsView.vue';

vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url === '/notion/connection')
      return {
        connection: {
          status: 'connected',
          direction: 'both',
          workspaceName: 'W',
          lastSyncAt: null,
        },
      };
    return { databases: [] };
  }),
  ApiError: class extends Error {},
}));

describe('ConnectorsView board look (spec 006 T050c)', () => {
  it('puts the connection status and sync controls inside PanelFrames', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(ConnectorsView).mount(el);
    expect(el.querySelector('h1')?.textContent).toBe('Notion sync');
    await vi.waitFor(() =>
      expect(
        [...el.querySelectorAll('.desk-panel-frame')].map(
          (f) => f.querySelector('h3')?.textContent,
        ),
      ).toEqual(['Connection', 'Sync']),
    );
  });
});
