import { createApp } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '../api/client.js';
// Static import: a cold import inside the test was charged to its 5 s timeout under full load.
import CaptureView from './CaptureView.vue';

vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url === '/capture/tokens') return { tokens: [] };
    if (url === '/categories') return { categories: [] };
    return { mappings: [], unmappedLabels: ['coffee'] };
  }),
  ApiError: class extends Error {
    code = 'internal';
  },
}));

describe('CaptureView board look (spec 006 T050c)', () => {
  it('puts the capture address and category mapping inside PanelFrames', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(CaptureView).mount(el);
    // The top bar owns the page h1.
    expect(el.querySelector('h1')).toBeNull();
    await vi.waitFor(() =>
      expect(
        [...el.querySelectorAll('.desk-panel-frame')].map(
          (f) => f.querySelector('h3')?.textContent,
        ),
      ).toEqual(['Capture address', 'Category mapping']),
    );
  });

  it('shows no rotation warning before an address exists, and warns once one is active', async () => {
    const mount = async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      createApp(CaptureView).mount(el);
      await vi.waitFor(() => expect(el.querySelector('.desk-panel-frame')).not.toBeNull());
      await new Promise((r) => setTimeout(r, 0));
      return el;
    };
    const none = await mount();
    expect(none.textContent).not.toContain('Rotating issues a new address');
    expect(none.textContent).toContain('Create capture address');

    vi.mocked(apiFetch).mockImplementationOnce(async () => ({
      tokens: [{ id: 't1', label: 'generic', revokedAt: null, lastUsedAt: null }],
    }));
    const one = await mount();
    await vi.waitFor(() => expect(one.textContent).toContain('Rotating issues a new address'));
    expect(one.textContent).toContain('Rotate address');
    expect(one.querySelector('.warn-text .desk-notice-lamp')).not.toBeNull();
  });

  it('shows the shared ErrorState, not inline text, when the tokens fail to load', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError('rate_limited' as never, 'x', 429));
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(CaptureView).mount(el);
    await vi.waitFor(() => expect(el.querySelector('.desk-error-state')).not.toBeNull());
    expect(el.querySelector('.error-text')).toBeNull();
  });
});
