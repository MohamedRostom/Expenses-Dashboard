import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import WidgetFrame from './WidgetFrame.vue';
import { WIDGET_KINDS, WIDGET_NAMES, WIDGET_STATES } from '../fixtures-widgets.js';

let app: App | null = null;
let host: HTMLElement;
function frame(props: Record<string, unknown>) {
  app?.unmount();
  host?.remove();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(WidgetFrame, props as never) });
  app.mount(host);
  return host.querySelector<HTMLElement>('[data-widget]')!;
}
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
});

describe('WidgetFrame', () => {
  it.each(WIDGET_KINDS)('%s renders each of the five states', (kind) => {
    for (const state of WIDGET_STATES) {
      const el = frame({ kind, state });
      expect(el.getAttribute('data-widget')).toBe(kind);
      expect(el.getAttribute('data-state')).toBe(state);
      expect(el.querySelector('[data-widget-body]')).not.toBeNull();
      expect(el.querySelector('h3')!.textContent).toBe(WIDGET_NAMES[kind]);
      expect(!!el.querySelector('[data-skeleton]')).toBe(state === 'loading');
    }
  });

  it('stale keeps the last value and shows lamp plus words', () => {
    const el = frame({ kind: 'currency', state: 'stale' });
    expect(el.querySelector('[data-lamp]')).not.toBeNull();
    expect(el.textContent).toContain('as of 09:07, not refreshed');
    expect(el.textContent).toMatch(/1\.18\d\d/);
  });

  it('error copy branches on the widget; content stays under the error where there is some', () => {
    const cur = frame({ kind: 'currency', state: 'error' });
    const curText = cur.textContent!;
    expect(curText).toMatch(/1\.18\d\d/);
    expect(frame({ kind: 'weather', state: 'error' }).textContent).not.toBe(curText);
  });

  it('controls are optional; ends use aria-disabled', () => {
    const el = frame({ kind: 'weather', controls: true, first: true, last: false });
    expect(el.querySelector('[data-testid="widget-remove"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="widget-settings"]')).not.toBeNull();
    expect(
      el.querySelector('[aria-label="Move Weather earlier"]')!.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      el.querySelector('[aria-label="Move Weather later"]')!.getAttribute('aria-disabled'),
    ).toBeNull();
    expect(frame({ kind: 'weather' }).querySelector('button')).toBeNull();
  });

  it('keeps the fixed 12rem height in every state', () => {
    const css = readFileSync(join(process.cwd(), 'src/catalogue/mockups/widgets.css'), 'utf-8');
    expect(css).toMatch(/\.wg-frame\s*\{[^}]*block-size:\s*12rem/);
  });
});
