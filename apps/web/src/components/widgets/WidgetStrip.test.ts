import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetT, WidgetTypeT } from '@desk/contracts';

vi.mock('../../api/widgets.js', () => ({
  getWidgets: vi.fn(),
  getWidgetTypes: vi.fn(),
  createWidget: vi.fn(),
  patchWidget: vi.fn(),
  deleteWidget: vi.fn(),
  postWidgetsRefresh: vi.fn(),
}));

const widget = (id: string, over: Partial<WidgetT> = {}): WidgetT =>
  ({
    id,
    kind: 'spend_pace',
    position: 0,
    settings: {},
    state: 'ready',
    asOf: '2026-10-03T12:00:00Z',
    ...over,
  }) as WidgetT;

const type = (kind: WidgetTypeT['kind'], name: string, enabled = true): WidgetTypeT => ({
  kind,
  name,
  description: `${name} description`,
  enabled,
  needsPlace: false,
  settingsSchema: {},
});

async function mount(widgets: WidgetT[], types: WidgetTypeT[] = []) {
  const api = await import('../../api/widgets.js');
  vi.mocked(api.getWidgets).mockResolvedValue({ widgets, limit: 8, temperatureUnit: 'C' });
  vi.mocked(api.getWidgetTypes).mockResolvedValue({ types });
  const { default: WidgetStrip } = await import('./WidgetStrip.vue');
  const pinia = createPinia();
  setActivePinia(pinia);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(WidgetStrip).use(pinia);
  app.mount(el);
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
  return { el, app };
}

describe('WidgetStrip', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => (document.body.innerHTML = ''));

  it('with no widgets explains widgets and offers only the enabled kinds', async () => {
    const { el, app } = await mount(
      [],
      [type('currency', 'Currency'), type('weather', 'Weather', false)],
    );
    expect(el.textContent).toContain('Widgets show');
    expect(el.textContent).toContain('Currency');
    expect(el.textContent).not.toContain('Weather');
    app.unmount();
  });

  it('renders frames in the order given', async () => {
    const { el, app } = await mount([
      widget('a', { kind: 'fixed_costs' }),
      widget('b', { kind: 'spend_pace' }),
    ]);
    const titles = [...el.querySelectorAll('[data-testid="widget-title"]')].map(
      (n) => n.textContent,
    );
    expect(titles).toEqual(['Fixed costs', 'Spend pace']);
    app.unmount();
  });

  it('disables add at the limit and shows the limit', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => widget(`w${i}`));
    const { el, app } = await mount(eight);
    const btn = el.querySelector<HTMLButtonElement>('[data-testid="add-widget"]');
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toContain('8 of 8');
    app.unmount();
  });

  it('shows a fixed-height loading frame for a widget with no figures yet', async () => {
    const { el, app } = await mount([widget('a', { state: 'empty' })]);
    expect(el.querySelector('[data-testid="widget-frame"]')).not.toBeNull();
    expect(el.querySelector('.desk-skeleton, [class*="skeleton"]')).not.toBeNull();
    app.unmount();
  });
});
