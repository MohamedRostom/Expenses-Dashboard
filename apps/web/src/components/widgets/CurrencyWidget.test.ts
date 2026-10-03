import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CurrencyRowT, WidgetT } from '@desk/contracts';

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

async function mountRows(rows: CurrencyRowT[]) {
  const { default: CurrencyWidget } = await import('./CurrencyWidget.vue');
  const el = document.createElement('div');
  const app = createApp(CurrencyWidget, { rows });
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
    const app = createApp(Sheet, { open: true, widget }).use(pinia);
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
