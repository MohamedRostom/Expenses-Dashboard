import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { WidgetT } from '@desk/contracts';
import WidgetFrame from './WidgetFrame.vue';

const widget = (over: Partial<WidgetT> = {}): WidgetT =>
  ({
    id: 'a',
    kind: 'spend_pace',
    position: 0,
    settings: {},
    state: 'ready',
    asOf: '2026-10-03T12:00:00Z',
    figures: { spentMinor: 1 },
    ...over,
  }) as WidgetT;

async function mount(props: Record<string, unknown>) {
  const events: Record<string, unknown[][]> = {};
  const on =
    (name: string) =>
    (...args: unknown[]) => {
      (events[name] ??= []).push(args);
    };
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({
    render: () =>
      h(
        WidgetFrame,
        {
          widget: widget(),
          index: 1,
          count: 3,
          atLimit: false,
          offline: false,
          onMove: on('move'),
          onDuplicate: on('duplicate'),
          onDragStart: on('dragStart'),
          onDragMove: on('dragMove'),
          onDragEnd: on('dragEnd'),
          ...props,
        },
        { default: () => h('p', { class: 'figs' }, 'figures') },
      ),
  });
  app.mount(el);
  await nextTick();
  return { el, events };
}

const btn = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  );

describe('WidgetFrame menu (T052)', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('Move up, Move down and Duplicate emit', async () => {
    const { el, events } = await mount({});
    btn(el, 'Move up')?.click();
    btn(el, 'Move down')?.click();
    btn(el, 'Duplicate')?.click();
    expect(events.move).toEqual([[-1], [1]]);
    expect(events.duplicate).toHaveLength(1);
  });

  it('disables Move up on the first frame and Move down on the last', async () => {
    const first = await mount({ index: 0 });
    expect(btn(first.el, 'Move up')?.disabled).toBe(true);
    expect(btn(first.el, 'Move down')?.disabled).toBe(false);
    document.body.innerHTML = '';
    const last = await mount({ index: 2 });
    expect(btn(last.el, 'Move down')?.disabled).toBe(true);
    expect(btn(last.el, 'Move up')?.disabled).toBe(false);
  });

  it('disables Duplicate at the limit', async () => {
    const { el } = await mount({ atLimit: true });
    expect(btn(el, 'Duplicate')?.disabled).toBe(true);
  });

  it('drag handle captures the pointer and relays move and up', async () => {
    const { el, events } = await mount({});
    const grip = el.querySelector<HTMLElement>('[data-testid="widget-grip"]')!;
    let captured: number | null = null;
    grip.setPointerCapture = (id: number) => {
      captured = id;
    };
    const ev = (type: string) => {
      const e = new Event(type, { bubbles: true });
      Object.assign(e, { pointerId: 7, clientX: 5, clientY: 6 });
      return e;
    };
    grip.dispatchEvent(ev('pointerdown'));
    grip.dispatchEvent(ev('pointermove'));
    grip.dispatchEvent(ev('pointerup'));
    expect(captured).toBe(7);
    expect(events.dragStart).toHaveLength(1);
    expect(events.dragMove).toHaveLength(1);
    expect(events.dragEnd).toHaveLength(1);
  });
});

describe('WidgetFrame offline copy', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('keeps the last figures and as-of time and says it is offline', async () => {
    const { el } = await mount({ offline: true });
    expect(el.querySelector('.figs')).not.toBeNull();
    expect(el.querySelector('.desk-widget-asof')?.textContent).toMatch(/^as of /);
    expect(el.textContent).toContain("You're offline — showing the last reading");
  });

  it('shows no offline line when online', async () => {
    const { el } = await mount({});
    expect(el.textContent).not.toContain("You're offline");
  });
});

describe('WidgetFrame empty state', () => {
  afterEach(() => (document.body.innerHTML = ''));
  const empty = (kind: WidgetT['kind']) =>
    mount({ widget: widget({ kind, state: 'empty', figures: undefined } as Partial<WidgetT>) });

  it('spend pace with no budget says so and links to Categories, not a skeleton', async () => {
    const { el } = await empty('spend_pace');
    expect(el.textContent).toContain('No budget set.');
    expect(el.textContent).toContain('Set a budget in Categories');
    expect(el.querySelector('[class*="skeleton"]')).toBeNull();
  });

  it('fixed costs with none says so', async () => {
    const { el } = await empty('fixed_costs');
    expect(el.textContent).toContain('No fixed-cost categories yet');
    expect(el.querySelector('[class*="skeleton"]')).toBeNull();
  });

  it('weather keeps the loading look while the reading is pending', async () => {
    const { el } = await empty('weather');
    expect(el.querySelector('[class*="skeleton"]')).not.toBeNull();
  });
});
