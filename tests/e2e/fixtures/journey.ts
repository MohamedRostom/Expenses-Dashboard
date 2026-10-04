import type { Page } from '@playwright/test';

export type JourneyCounts = { taps: number; keystrokes: number; screens: number };

const LOCATOR_METHODS = [
  'locator',
  'getByRole',
  'getByLabel',
  'getByText',
  'getByPlaceholder',
  'getByTestId',
  'first',
  'last',
  'nth',
  'filter',
  'and',
  'or',
];

/**
 * Wraps a page so user-effort can be counted (spec 004 FR-010): taps (click/tap),
 * keystrokes (press = 1, fill/type = one per character) and screens (main-frame
 * pathname changes; query or hash changes and dialogs do not count).
 * The page the journey starts on is NOT a screen; only navigations after startJourney count.
 */
export function startJourney(page: Page): { page: Page; counts(): JourneyCounts } {
  const c: JourneyCounts = { taps: 0, keystrokes: 0, screens: 0 };
  const count = (key: 'taps' | 'keystrokes', n = 1) => (c[key] += n);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (target: any, hooks: Record<string, (args: any[]) => void>, chain: string[]): any =>
    new Proxy(target, {
      get(t, prop, recv) {
        const v = Reflect.get(t, prop, recv);
        if (typeof prop !== 'string' || typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          hooks[prop]?.(args);
          const out = v.apply(t, args);
          return chain.includes(prop) ? wrap(out, locatorHooks, LOCATOR_METHODS) : out;
        };
      },
    });
  const tap = () => count('taps');
  const locatorHooks = {
    click: tap,
    tap,
    press: () => count('keystrokes'),
    fill: (a: unknown[]) => count('keystrokes', String(a[0]).length),
  };

  const keyboard = wrap(
    page.keyboard,
    { press: () => count('keystrokes'), type: (a) => count('keystrokes', String(a[0]).length) },
    [],
  );
  const proxy: Page = new Proxy(wrap(page, { click: tap, tap }, LOCATOR_METHODS), {
    get: (t, p, r) => (p === 'keyboard' ? keyboard : Reflect.get(t, p, r)),
  });

  let last = new URL(page.url() || 'about:blank').pathname;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const next = new URL(page.url()).pathname;
    if (next !== last) c.screens++;
    last = next;
  });
  return { page: proxy, counts: () => ({ ...c }) };
}
