import { createApp, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WidgetsMock from './WidgetsMock.vue';
import { PACE_MS, RATE_MS, WEATHER_MS } from './useMockLive.js';
import { DEFAULT_STRIP, WIDGET_KINDS, WIDGET_NAMES, type WidgetKind } from '../fixtures-widgets.js';

let app: App | null = null;
let host: HTMLElement;

async function mount(query = 'live=off') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push(`/__ui/mockups/widgets?${query}`);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(WidgetsMock);
  app.use(router);
  app.mount(host);
  await nextTick();
}
function unmount() {
  app?.unmount();
  host?.remove();
  app = null;
}
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const strip = () => $('[data-mockup-panel="strip"]')!;
const order = () =>
  [...strip().querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')!);
const name = (k: string) => WIDGET_NAMES[k as WidgetKind];
const btn = (label: string) => $$('button').find((b) => b.getAttribute('aria-label') === label)!;
const live = (kind: string) => $(`[data-live="${kind}"]`)!.textContent!.trim();
const flush = async () => {
  await nextTick();
  await nextTick();
};

describe('WidgetsMock contract', () => {
  it('sits in the proposed wrapper with a strip and a static matrix of 5 widgets x 5 states', async () => {
    await mount();
    expect($('[data-identity="proposed"] [data-mockup="widgets"]')).not.toBeNull();
    expect(order()).toEqual(DEFAULT_STRIP);
    expect($$('[data-mockup-panel="matrix"] [data-sample]')).toHaveLength(25);
  });

  it.each(['loading', 'empty', 'error', 'stale'])(
    '?state=%s changes the strip but the matrix still has 25 cells in all states',
    async (state) => {
      await mount(`live=off&state=${state}`);
      const strips = $$('[data-mockup-panel="strip"] [data-widget]');
      expect(strips.every((w) => w.getAttribute('data-state') === state)).toBe(true);
      const matrix = $$('[data-mockup-panel="matrix"] [data-sample]');
      expect(matrix).toHaveLength(25);
      expect(new Set(matrix.map((w) => w.getAttribute('data-state'))).size).toBe(5);
    },
  );

  it('stale strip widgets keep the value and say so in a lamp and words', async () => {
    await mount('live=off&state=stale');
    const w = $('[data-mockup-panel="strip"] [data-widget="currency"]')!;
    expect(w.textContent).toContain('as of 09:07, not refreshed');
    expect(w.querySelector('[data-lamp]')).not.toBeNull();
    expect(w.querySelector('[data-live="rate"]')!.textContent).toMatch(/\d\.\d{4}/);
  });

  it('?sheet=add-widget opens the add dialog at load', async () => {
    await mount('live=off&sheet=add-widget');
    expect($('[role="dialog"]')!.getAttribute('aria-label')).toBe('Add a widget');
  });

  it('?sheet=widget-settings opens the settings dialog at load', async () => {
    await mount('live=off&sheet=widget-settings');
    expect($('[role="dialog"]')!.getAttribute('aria-label')).toMatch(/settings/i);
  });
});

describe('reorder', () => {
  it('Move later swaps the order and announces it politely', async () => {
    await mount();
    const [a, b] = order();
    btn(`Move ${name(a!)} later`).click();
    await flush();
    expect(order().slice(0, 2)).toEqual([b, a]);
    const msg = $('[aria-live="polite"]')!.textContent!;
    expect(msg).toContain(name(a!));
    expect(msg).toMatch(/position 2 of 4/);
  });

  it('keeps focus on the equivalent button in the moved widget', async () => {
    await mount();
    const a = order()[0]!;
    const b = btn(`Move ${name(a)} later`);
    b.focus();
    b.click();
    await flush();
    expect(document.activeElement).toBe(btn(`Move ${name(a)} later`));
  });

  it('clamps at the ends: first cannot move earlier, last cannot move later', async () => {
    await mount();
    const before = order();
    const first = btn(`Move ${name(before[0]!)} earlier`);
    const last = btn(`Move ${name(before[before.length - 1]!)} later`);
    expect(first.getAttribute('aria-disabled')).toBe('true');
    expect(last.getAttribute('aria-disabled')).toBe('true');
    first.click();
    last.click();
    await flush();
    expect(order()).toEqual(before);
  });

  it('a pointer drag ends in the same order as the keyboard move', async () => {
    await mount();
    const before = order();
    // four widgets stacked, 100px apart
    $$('[data-mockup-panel="strip"] [data-widget]').forEach((el, i) => {
      el.getBoundingClientRect = () =>
        ({ left: 0, top: i * 100, width: 100, height: 90 }) as DOMRect;
    });
    const first = $('[data-mockup-panel="strip"] [data-widget]')!;
    const ev = (type: string, y: number) =>
      new MouseEvent(type, { clientX: 50, clientY: y, button: 0, bubbles: true });
    first.dispatchEvent(ev('pointerdown', 45));
    first.dispatchEvent(ev('pointermove', 145));
    first.dispatchEvent(ev('pointerup', 145));
    await flush();
    const dragged = order();
    unmount();
    await mount();
    btn(`Move ${name(before[0]!)} later`).click();
    await flush();
    expect(dragged).toEqual(order());
    expect(dragged).not.toEqual(before);
  });
});

describe('add and remove', () => {
  it('the add sheet lists absent kinds as buttons; adding appends; removing frees a kind', async () => {
    await mount();
    const absent = WIDGET_KINDS.filter((k) => !DEFAULT_STRIP.includes(k));
    $('[data-testid="add-widget"]')!.click();
    await flush();
    const dialog = $('[role="dialog"]')!;
    const buttons = [...dialog.querySelectorAll('button')];
    const names = buttons.map((b) => b.textContent!.trim());
    for (const k of absent) expect(names).toContain(WIDGET_NAMES[k]);
    for (const k of DEFAULT_STRIP) expect(names).not.toContain(WIDGET_NAMES[k]);

    buttons.find((b) => b.textContent!.trim() === WIDGET_NAMES[absent[0]!])!.click();
    await flush();
    expect(order()).toEqual([...DEFAULT_STRIP, absent[0]]);
    await vi.waitFor(() => expect($('[role="dialog"]')).toBeNull());

    const victim = order()[1]!;
    $(
      `[data-mockup-panel="strip"] [data-widget="${victim}"] [data-testid="widget-remove"]`,
    )!.click();
    await flush();
    await vi.waitFor(() => expect(order()).not.toContain(victim));
    $('[data-testid="add-widget"]')!.click();
    await flush();
    expect($('[role="dialog"]')!.textContent).toContain(name(victim));
  });
});

describe('sheets', () => {
  it('Escape closes and returns focus to the opener', async () => {
    await mount();
    const opener = $('[data-testid="add-widget"]')!;
    opener.focus();
    opener.click();
    await flush();
    const dialog = $('[role="dialog"]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    await vi.waitFor(() => expect($('[role="dialog"]')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('traps Tab inside the dialog', async () => {
    await mount('live=off&sheet=add-widget');
    const dialog = $('[role="dialog"]')!;
    const items = [...dialog.querySelectorAll<HTMLElement>('button, select, input')];
    items[items.length - 1]!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });
});

describe('live', () => {
  it('rate flips once, weather refreshes and flips, the pace marker advances', async () => {
    vi.useFakeTimers();
    await mount('');
    const rate = live('rate');
    const weather = live('weather');
    const pace = live('pace');
    expect($('[data-live="rate"]')!.className).not.toContain('mk-flip');
    vi.advanceTimersByTime(RATE_MS + 5);
    await flush();
    expect(live('rate')).not.toBe(rate);
    expect($('[data-live="rate"]')!.className).toContain('mk-flip');
    const after = live('rate');
    vi.advanceTimersByTime(PACE_MS * 3);
    await flush();
    expect(live('rate')).toBe(after);
    expect(live('pace')).not.toBe(pace);
    vi.advanceTimersByTime(WEATHER_MS);
    await flush();
    expect(live('weather')).not.toBe(weather);
    expect($('[data-live="weather"]')!.className).toContain('mk-flip');
  });

  it('?live=off keeps everything still', async () => {
    vi.useFakeTimers();
    await mount('live=off');
    const snap = ['rate', 'weather', 'pace'].map(live);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    await flush();
    expect(['rate', 'weather', 'pace'].map(live)).toEqual(snap);
  });
});

describe('settle-in', () => {
  it('a widget added after load does not replay mk-settle', async () => {
    await mount();
    const frames = () => [...document.querySelectorAll<HTMLElement>('[data-widget]')];
    expect(frames().every((f) => f.classList.contains('mk-settle'))).toBe(true);
    const absent = WIDGET_KINDS.find((k) => !DEFAULT_STRIP.includes(k))!;
    (document.querySelector('[data-testid="add-widget"]') as HTMLElement).click();
    await nextTick();
    await nextTick();
    const btn = [...document.querySelectorAll<HTMLElement>('.wg-sheet-list button')].find((b) =>
      b.textContent?.includes(WIDGET_NAMES[absent]),
    )!;
    btn.click();
    await nextTick();
    await nextTick();
    const added = document.querySelector<HTMLElement>(`[data-widget="${absent}"]`)!;
    expect(added.classList.contains('mk-settle')).toBe(false);
  });
});
