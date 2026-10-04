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
  putWidgetsOrder: vi.fn(),
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

async function mount(widgets: WidgetT[], types: WidgetTypeT[] = [], typesError?: unknown) {
  const api = await import('../../api/widgets.js');
  vi.mocked(api.getWidgets).mockResolvedValue({ widgets, limit: 8, temperatureUnit: 'C' });
  if (typesError) vi.mocked(api.getWidgetTypes).mockRejectedValue(typesError);
  else vi.mocked(api.getWidgetTypes).mockResolvedValue({ types });
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

  describe('failed load (T080)', () => {
    async function mountFailing(err: unknown) {
      const api = await import('../../api/widgets.js');
      vi.mocked(api.getWidgets).mockRejectedValue(err);
      vi.mocked(api.getWidgetTypes).mockResolvedValue({ types: [] });
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

    it('a 500 shows the error state, not "No widgets yet"', async () => {
      const { ApiError } = await import('../../api/client.js');
      const { el, app } = await mountFailing(new ApiError('internal', 'boom', 500));
      expect(el.textContent).not.toContain('No widgets yet');
      expect(el.textContent).toContain('Something went wrong');
      app.unmount();
    });

    it('a network failure while offline shows the offline copy', async () => {
      const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const { el, app } = await mountFailing(new TypeError('Failed to fetch'));
      expect(el.textContent).not.toContain('No widgets yet');
      expect(el.textContent).toContain("You're offline");
      app.unmount();
      spy.mockRestore();
    });
  });

  it('a failed catalogue fetch shows an error in the add sheet, not an empty list (T093)', async () => {
    const { ApiError } = await import('../../api/client.js');
    const { el, app } = await mount([widget('a')], [], new ApiError('internal', 'boom', 500));
    el.querySelector<HTMLButtonElement>('[data-testid="add-widget"]')!.click();
    for (let i = 0; i < 5; i++) await nextTick();
    expect(document.body.textContent).toContain('Something went wrong');
    expect(document.body.textContent).not.toContain('No widgets available yet');
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

  it('renders a real branch for each kind once figures exist', async () => {
    const attribution = 'Weather data by Open-Meteo.com' as const;
    const { el, app } = await mount([
      widget('w', {
        kind: 'weather',
        figures: {
          place: 'Manchester',
          temperatureC: 20,
          condition: 'Clear sky',
          icon: 'sun',
          todayMaxC: 22,
          todayMinC: 10,
          outlook: [],
          observedAt: '2026-10-03T11:00:00Z',
          attribution,
        },
      } as Partial<WidgetT>),
      widget('s', {
        kind: 'sunrise',
        figures: {
          place: 'Manchester',
          sunrise: '07:00',
          sunset: '18:00',
          daylightSeconds: 39600,
          placeTimeZone: 'Europe/London',
          showZone: false,
          attribution,
        },
      } as Partial<WidgetT>),
      widget('p', {
        kind: 'spend_pace',
        figures: {
          spentMinor: 1,
          budgetMinor: 2,
          pct: 50,
          daysLeft: 3,
          dailyToBudgetMinor: 1,
          overBudget: false,
        },
      } as Partial<WidgetT>),
      widget('f', {
        kind: 'fixed_costs',
        figures: { remaining: [], totalExpectedMinor: 0, allRecorded: true },
      } as Partial<WidgetT>),
    ]);
    expect(el.querySelector('.desk-weather')?.textContent).toContain('20°C');
    expect(el.textContent).toContain('Day length');
    expect(el.textContent).toContain('50%');
    expect(el.textContent).toContain('All fixed costs are in');
    app.unmount();
  });

  it('shows a fixed-height loading frame for a widget with no figures yet', async () => {
    const { el, app } = await mount([widget('a', { kind: 'weather', state: 'empty' })]);
    expect(el.querySelector('[data-testid="widget-frame"]')).not.toBeNull();
    expect(el.querySelector('.desk-skeleton, [class*="skeleton"]')).not.toBeNull();
    app.unmount();
  });

  describe('arrange (T052)', () => {
    const three = () => [
      widget('a', { kind: 'fixed_costs' }),
      widget('b', { kind: 'spend_pace' }),
      widget('c', { kind: 'currency', figures: { rows: [] } } as Partial<WidgetT>),
    ];
    const ids = (el: HTMLElement) =>
      [...el.querySelectorAll('[data-testid="widget-frame"]')].map((n) =>
        n.getAttribute('data-widget-id'),
      );
    const flush = async () => {
      for (let i = 0; i < 5; i++) await nextTick();
      await new Promise((r) => setTimeout(r, 0));
    };

    it('Move down saves the full order and announces the new position', async () => {
      const api = await import('../../api/widgets.js');
      vi.mocked(api.putWidgetsOrder).mockImplementation(async (order) => ({
        widgets: order.map((id) => widget(id)),
        limit: 8,
        temperatureUnit: 'C',
      }));
      const { el, app } = await mount(three());
      const down = [...el.querySelectorAll<HTMLButtonElement>('button')].filter(
        (b) => b.textContent?.trim() === 'Move down',
      );
      down[0]?.click();
      await flush();
      expect(api.putWidgetsOrder).toHaveBeenCalledWith(['b', 'a', 'c']);
      expect(ids(el)).toEqual(['b', 'a', 'c']);
      const live = el.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('Fixed costs moved to position 2 of 3');
      app.unmount();
    });

    it('Duplicate posts duplicateOf', async () => {
      const api = await import('../../api/widgets.js');
      vi.mocked(api.createWidget).mockResolvedValue({ widget: widget('d') });
      const { el, app } = await mount(three());
      [...el.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === 'Duplicate')
        ?.click();
      await flush();
      expect(api.createWidget).toHaveBeenCalledWith({ kind: 'fixed_costs', duplicateOf: 'a' });
      app.unmount();
    });

    it('pointer drag reorders locally and saves once on pointerup', async () => {
      const api = await import('../../api/widgets.js');
      vi.mocked(api.putWidgetsOrder).mockImplementation(async (order) => ({
        widgets: order.map((id) => widget(id)),
        limit: 8,
        temperatureUnit: 'C',
      }));
      const { el, app } = await mount(three());
      const frames = [...el.querySelectorAll<HTMLElement>('[data-testid="widget-frame"]')];
      // jsdom has no layout: three stacked 100px-high frames.
      frames.forEach((f, i) => {
        f.getBoundingClientRect = () =>
          ({ top: i * 100, bottom: i * 100 + 100, left: 0, right: 100 }) as DOMRect;
      });
      const grip = frames[0]!.querySelector<HTMLElement>('[data-testid="widget-grip"]')!;
      grip.setPointerCapture = vi.fn();
      const ev = (type: string, y: number) => {
        const e = new Event(type, { bubbles: true });
        Object.assign(e, { pointerId: 1, clientX: 50, clientY: y });
        grip.dispatchEvent(e);
      };
      ev('pointerdown', 10);
      ev('pointermove', 150);
      await nextTick();
      expect(ids(el)).toEqual(['b', 'a', 'c']);
      expect(api.putWidgetsOrder).not.toHaveBeenCalled();
      ev('pointerup', 150);
      await flush();
      expect(api.putWidgetsOrder).toHaveBeenCalledOnce();
      expect(api.putWidgetsOrder).toHaveBeenCalledWith(['b', 'a', 'c']);
      app.unmount();
    });

    it('a drop with no change sends nothing', async () => {
      const api = await import('../../api/widgets.js');
      const { el, app } = await mount(three());
      const grip = el.querySelector<HTMLElement>('[data-testid="widget-grip"]')!;
      grip.setPointerCapture = vi.fn();
      for (const type of ['pointerdown', 'pointerup']) {
        const e = new Event(type, { bubbles: true });
        Object.assign(e, { pointerId: 1, clientX: 0, clientY: 0 });
        grip.dispatchEvent(e);
      }
      await flush();
      expect(api.putWidgetsOrder).not.toHaveBeenCalled();
      app.unmount();
    });
  });
});
