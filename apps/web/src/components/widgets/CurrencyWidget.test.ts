import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CurrencyRowT, WidgetT } from '@desk/contracts';
import source from './CurrencyWidget.vue?raw';

vi.mock('../../api/widgets.js', () => ({
  patchWidget: vi.fn(),
  createWidget: vi.fn(),
}));
vi.mock('../../api/client.js', () => ({
  apiFetch: vi.fn(async () => ({
    currencies: ['GBP', 'EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].map((code) => ({
      code,
      name: code,
      exponent: 2,
    })),
  })),
  ApiError: class extends Error {},
}));

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

// Cold-importing the sheet's component graph takes several seconds under full parallel load and
// was charged to the first settings test's 5 s timeout; warm the module cache once instead.
beforeAll(async () => {
  await Promise.all([import('./CurrencyWidget.vue'), import('./WidgetSettingsSheet.vue')]);
}, 60_000);

/** The file's single createApp call site (vue/one-component-per-file counts each call). */
const newApp = (c: Component, props: Record<string, unknown>) => createApp(c, props);

async function mountRows(rows: CurrencyRowT[]) {
  const { default: CurrencyWidget } = await import('./CurrencyWidget.vue');
  const el = document.createElement('div');
  const app = newApp(CurrencyWidget, { rows });
  app.mount(el);
  await nextTick();
  return { el, app };
}

const row = (over: Partial<Extract<CurrencyRowT, { rate: number }>> = {}): CurrencyRowT => ({
  code: 'EUR',
  rate: 1.1634,
  rateDate: '2026-10-02',
  prevChange: { pct: 0.4, direction: 'up' },
  monthChange: { pct: 1.2, direction: 'down', since: '2026-09-02' },
  ...over,
});

describe('CurrencyWidget', () => {
  it('shows rate, date, both changes as accessible text, and the since label', async () => {
    const { el, app } = await mountRows([row()]);
    const t = el.textContent ?? '';
    expect(t).toContain('EUR');
    expect(t).toContain('1.1634');
    expect(t).toContain('2026-10-02');
    expect(t).toContain('up 0.4%');
    expect(t).toContain('down 1.2%');
    expect(t).toContain('since 2026-09-02');
    app.unmount();
  });

  it('formats a whole-number change to one decimal', async () => {
    const { el, app } = await mountRows([row({ prevChange: { pct: 12, direction: 'up' } })]);
    expect(el.textContent).toContain('up 12.0%');
    app.unmount();
  });

  it('says "not available yet" for both changes when changes are pending', async () => {
    const { el, app } = await mountRows([
      row({ changesPending: true, prevChange: null, monthChange: null }),
    ]);
    expect(el.textContent?.match(/not available yet/g)).toHaveLength(2);
    app.unmount();
  });

  it('shows a pending row as its code with "rate not available yet"', async () => {
    const { el, app } = await mountRows([{ code: 'CAD', pending: true }]);
    expect(el.textContent).toContain('CAD');
    expect(el.textContent).toContain('rate not available yet');
    app.unmount();
  });

  it('shows the default currency row without figures', async () => {
    const { el, app } = await mountRows([{ code: 'GBP', isDefault: true }]);
    expect(el.textContent).toContain('your default currency');
    expect(el.textContent).not.toMatch(/\d\.\d/);
    app.unmount();
  });
});

describe('CurrencyWidget layout (review 2026-11-26)', () => {
  it('each quoted row is a tile: code badge, headline rate, and one chip per change with its direction', async () => {
    const { el, app } = await mountRows([row()]);
    const tile = el.querySelector('.desk-currency-row')!;
    expect(tile.querySelector('.desk-currency-code')?.textContent).toBe('EUR');
    expect(tile.querySelector('.desk-currency-rate')?.textContent).toBe('1.1634');
    const chips = [...tile.querySelectorAll<HTMLElement>('.desk-currency-change')];
    expect(chips.map((c) => c.dataset.direction)).toEqual(['up', 'down']);
    // Direction is in words as well as the glyph (never colour alone).
    expect(chips[0]!.textContent).toMatch(/Day.*up 0\.4%/s);
    expect(chips[1]!.textContent).toMatch(/30 days.*down 1\.2%/s);
    app.unmount();
  });
  it('"since" lives inside its chip (tooltip and accessible text), so a tile never grows a third line', async () => {
    const { el, app } = await mountRows([row()]);
    const month = el.querySelectorAll<HTMLElement>('.desk-currency-change')[1]!;
    expect(month.title).toBe('since 2026-09-02');
    expect(month.querySelector('.desk-currency-since')?.textContent).toBe('since 2026-09-02');
    expect(el.querySelector('.desk-currency-changes > .desk-currency-since')).toBeNull();
    app.unmount();
  });
  it('the code badge is a neutral label, not the accent (the accent is for actions and spend)', () => {
    const start = source.indexOf('\n.desk-currency-code {');
    expect(source.slice(start, source.indexOf('}', start))).not.toContain('--color-accent');
  });
  it('the converted amount is part of its row, not a separate sentence', async () => {
    const { default: CurrencyWidget } = await import('./CurrencyWidget.vue');
    const el = document.createElement('div');
    newApp(CurrencyWidget, { rows: [row({ rate: 2 })], defaultCode: 'GBP' }).mount(el);
    await nextTick();
    const input = el.querySelector<HTMLInputElement>('input')!;
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(el.querySelector('.desk-currency-row .desk-currency-result')?.textContent).toContain(
      '3 EUR = 6 GBP',
    );
  });
});

describe('currency settings', () => {
  async function mountSettings(codes: string[]) {
    const api = await import('../../api/widgets.js');
    vi.mocked(api.patchWidget).mockResolvedValue({ widget: {} as WidgetT });
    const { useSessionStore } = await import('../../stores/session.js');
    const { default: Sheet } = await import('./WidgetSettingsSheet.vue');
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().$patch({ user: { defaultCurrency: 'GBP' } as never });
    const widget = {
      id: 'w1',
      kind: 'currency',
      position: 0,
      settings: { currencies: codes },
      state: 'ready',
      asOf: '2026-10-03T12:00:00Z',
    } as WidgetT;
    const app = newApp(Sheet, { open: true, widget }).use(pinia);
    app.mount(document.createElement('div'));
    await flush();
    return { app, api };
  }
  const box = (code: string) =>
    document.querySelector<HTMLInputElement>(`input[type="checkbox"][value="${code}"]`)!;

  it('patches settings when a currency is ticked, and disables the default with a reason', async () => {
    const { app, api } = await mountSettings(['EUR']);
    expect(box('GBP').disabled).toBe(true);
    expect(document.body.textContent).toContain('your default currency');
    box('USD').click();
    await flush();
    expect(api.patchWidget).toHaveBeenCalledWith('w1', {
      settings: { currencies: ['EUR', 'USD'] },
    });
    app.unmount();
  });

  it('caps at six with a message and an offer to add a second widget', async () => {
    const { app } = await mountSettings(['EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD']);
    expect(box('NZD').disabled).toBe(true);
    expect(document.body.textContent).toContain('six');
    expect(document.body.textContent).toContain('Add a second currency widget');
    app.unmount();
  });
});

describe('CurrencyWidget converter (review 2026-11-25)', () => {
  it('converts a typed amount of each currency into the default currency', async () => {
    const { default: CurrencyWidget } = await import('./CurrencyWidget.vue');
    const el = document.createElement('div');
    newApp(CurrencyWidget, { rows: [row({ rate: 0.85033 })], defaultCode: 'GBP' }).mount(el);
    await nextTick();
    const input = el.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    expect(el.querySelector('label')?.textContent).toBe('Amount to convert'); // not "Amount": the add-expense form owns that name
    input.value = '100';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(el.textContent).toContain('100 EUR = 85.03 GBP');
  });
  it('without a default currency there is no converter', async () => {
    const { el } = await mountRows([row()]);
    expect(el.querySelector('input')).toBeNull();
  });
});
