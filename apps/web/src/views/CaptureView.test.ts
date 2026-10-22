import { createApp } from 'vue';
import { describe, expect, it, vi } from 'vitest';
// Static import: a cold import inside the test was charged to its 5 s timeout under full load.
import CaptureView from './CaptureView.vue';

vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url === '/capture/tokens') return { tokens: [] };
    if (url === '/categories') return { categories: [] };
    return { mappings: [], unmappedLabels: ['coffee'] };
  }),
  ApiError: class extends Error {},
}));

describe('CaptureView board look (spec 006 T050c)', () => {
  it('puts the capture address and category mapping inside PanelFrames', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(CaptureView).mount(el);
    expect(el.querySelector('h1')?.textContent).toBe('Phone capture');
    await vi.waitFor(() =>
      expect(
        [...el.querySelectorAll('.desk-panel-frame')].map(
          (f) => f.querySelector('h3')?.textContent,
        ),
      ).toEqual(['Capture address', 'Category mapping']),
    );
  });
});
