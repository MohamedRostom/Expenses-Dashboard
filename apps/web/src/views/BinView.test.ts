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

  it('Restore is a default-size secondary button, not a small ghost one', async () => {
    app = createApp(BinView);
    app.use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await flush();
    const btn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Restore',
    )!;
    expect(btn.classList.contains('sm')).toBe(false);
    expect(btn.classList.contains('ghost')).toBe(false);
    expect(btn.classList.contains('secondary')).toBe(true);
  });

  it('the Restore column is as wide as its button, so the button is not clipped by the panel', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/BinView.vue', 'utf8');
    const rule =
      /\.desk-bin-view :deep\(td\.desk-col--action\)[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(rule).toContain('width: auto');
    expect(rule).toContain('white-space: nowrap');
  });

  it('right-aligns Restore to the panel edge, clears the row rules, and gaps the title from the heads', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/BinView.vue', 'utf8');
    const rule = /Restore meets[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(rule).toContain('text-align: end');
    expect(rule).toMatch(/padding-block: var\(--space-1\)/);
    expect(src).toMatch(
      /\.desk-bin-view :deep\(\.desk-data-table-wrap\) \{[^}]*padding-block-start/,
    );
  });
});
