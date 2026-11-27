import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotionClient } from './notion/client.js';
import { FrankfurterRates } from './rates/frankfurter.js';
import { OpenMeteoClient } from './open-meteo/client.js';

// PR #49 review: workerd throws "Illegal invocation" when the global fetch is called with any
// `this` but the global scope, e.g. stored on a class and called as `this.fetchImpl(...)`.
// This stub enforces the same rule, so Node catches it before a Worker does.
// Records each call's `this`: the clients catch fetch errors themselves, so a throw alone
// could be swallowed.
function workerdFetch(seen: unknown[]) {
  return vi.fn(function (this: unknown) {
    seen.push(this);
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect `this` reference');
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('connectors call the default fetch the way workerd allows', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['NotionClient', () => new NotionClient('t').searchDatabases()],
    ['FrankfurterRates', () => new FrankfurterRates().rate('2026-01-02', 'GBP', 'EUR')],
    ['OpenMeteoClient', () => new OpenMeteoClient().search('London')],
  ];
  it.each(cases)('%s', async (_name, call) => {
    const seen: unknown[] = [];
    vi.stubGlobal('fetch', workerdFetch(seen));
    await call().catch(() => {});
    expect(seen.length).toBeGreaterThan(0);
    for (const self of seen) expect(self === undefined || self === globalThis).toBe(true);
  });
});
