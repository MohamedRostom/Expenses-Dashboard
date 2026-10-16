// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import PanelFrame from './PanelFrame.vue';

type PanelErrorKind = string;

async function text(props: Record<string, unknown>) {
  const el = document.createElement('div');
  createApp(PanelFrame, props).mount(el);
  await nextTick();
  return el.textContent ?? '';
}

describe('PanelFrame', () => {
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
    ['source_paused', 'Place search is paused'],
    ['rate_limited', 'Too many requests'],
  ])('error %s shows its own title', async (code, title) => {
    expect(await text({ kind: 'error', code })).toContain(title);
  });

  it('gives each new widget cause distinct copy', async () => {
    const a = await text({ kind: 'error', code: 'source_unreachable' });
    const b = await text({ kind: 'error', code: 'source_limit_reached' });
    const c = await text({ kind: 'error', code: 'place_not_found' });
    const d = await text({ kind: 'error', code: 'source_paused' });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe('PanelFrame loaded content (T032)', () => {
  it('with a heading and a default slot, renders the slot in a labelled region', async () => {
    const el = document.createElement('div');
    createApp({
      render: () =>
        h(PanelFrame, { heading: 'Entries' }, { default: () => h('p', { class: 'x' }, 'rows') }),
    }).mount(el);
    await nextTick();
    const region = el.querySelector('section[role="region"]')!;
    const heading = region.querySelector('h3')!;
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(region.querySelector('.x')?.textContent).toBe('rows');
  });

  it('a kind still wins over the slot (existing states unchanged)', async () => {
    const el = document.createElement('div');
    createApp({
      render: () =>
        h(
          PanelFrame,
          { heading: 'Entries', kind: 'error', code: 'offline' },
          { default: () => h('p', { class: 'x' }, 'rows') },
        ),
    }).mount(el);
    await nextTick();
    expect(el.querySelector('.x')).toBeNull();
    expect(el.textContent).toContain("You're offline");
  });
});
