import { createPinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BinView from './BinView.vue';

vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async () => ({
    expenses: [
      {
        id: 'e1',
        date: '2026-10-01',
        description: 'Coffee',
        amountOriginal: 350,
        currencyOriginal: 'GBP',
        deletedAt: '2026-10-02T00:00:00Z',
      },
    ],
  })),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('BinView board look', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => app?.unmount());

  it('puts the table inside a glass panel frame', async () => {
    app = createApp(BinView);
    app.use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await flush();
    const frame = el.querySelector('.desk-panel-frame')!;
    expect(frame).not.toBeNull();
    expect(frame.querySelector('.desk-data-table-wrap')).not.toBeNull();
  });
});
