import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForecastTile from './ForecastTile.vue';

const basis = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async () => ({ forecast: 90000, currency: 'GBP', basis: basis.value })),
}));

describe('ForecastTile note', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
  });
  async function noteFor(b: string[]) {
    basis.value = b;
    app = createApp(ForecastTile, { month: '2026-11' });
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    return el.textContent ?? '';
  }

  it('reads the full basis as one plain sentence', async () => {
    const text = await noteFor([
      'spend to date',
      'remaining fixed-kind budgets',
      'variable run-rate',
    ]);
    expect(text).toContain(
      'Based on what you have spent so far, fixed budgets still to come and your average daily variable spend for the days left.',
    );
    expect(text).not.toContain('Based on:');
  });

  it('says so when there is no spend or variable history yet', async () => {
    const text = await noteFor([
      'no spend yet',
      'no fixed-kind budgets',
      'no variable spend history yet',
    ]);
    expect(text).toContain('what you have spent so far');
    expect(text).toContain('no variable spend history yet');
    expect(text).not.toContain('no spend yet');
  });

  it('falls back to the raw basis for strings it does not know', async () => {
    expect(await noteFor(['something new'])).toContain('Based on something new.');
  });
});
