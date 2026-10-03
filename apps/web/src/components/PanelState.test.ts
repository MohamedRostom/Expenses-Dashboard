import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import PanelState from './PanelState.vue';
import type { PanelErrorKind } from '../utils/errors.js';

async function text(props: Record<string, unknown>) {
  const el = document.createElement('div');
  createApp(PanelState, props).mount(el);
  await nextTick();
  return el.textContent ?? '';
}

describe('PanelState', () => {
  it.each<[PanelErrorKind, string]>([
    ['offline', "You're offline"],
    ['session_expired', 'Session expired'],
    ['validation', "That didn't look right"],
    ['rate_unavailable', 'Exchange rate unavailable'],
    ['connector_error', 'Connector problem'],
    ['server_error', 'Something went wrong'],
    ['source_unreachable', "Couldn't reach the data source"],
    ['source_limit_reached', 'Data source limit reached'],
    ['place_not_found', 'Place not found'],
  ])('error %s shows its own title', async (code, title) => {
    expect(await text({ kind: 'error', code })).toContain(title);
  });

  it('gives each new widget cause distinct copy', async () => {
    const a = await text({ kind: 'error', code: 'source_unreachable' });
    const b = await text({ kind: 'error', code: 'source_limit_reached' });
    const c = await text({ kind: 'error', code: 'place_not_found' });
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
