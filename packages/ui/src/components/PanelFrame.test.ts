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

describe('PanelFrame surface (T012)', () => {
  it('the headed flap carries the shared .surface class', async () => {
    const el = document.createElement('div');
    createApp(PanelFrame, { heading: 'Panel' }).mount(el);
    await nextTick();
    expect(el.querySelector('.desk-panel-frame-flap')?.classList.contains('surface')).toBe(true);
  });
});

describe('PanelFrame heading inside the glass (T048)', () => {
  it('the heading is the panel label, a real h3 inside the surface above the content', async () => {
    const el = document.createElement('div');
    createApp({
      render: () =>
        h(PanelFrame, { heading: 'Entries' }, { default: () => h('p', { class: 'x' }, 'rows') }),
    }).mount(el);
    await nextTick();
    const flap = el.querySelector('.desk-panel-frame-flap')!;
    const heading = flap.querySelector('h3')!;
    expect(heading.textContent).toBe('Entries');
    expect(heading.compareDocumentPosition(flap.querySelector('.x')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/PanelFrame.vue', 'utf8');
    const rule = src.match(/\.desk-panel-frame-heading \{[^}]*\}/)![0];
    for (const t of [
      '--text-xs',
      'font-weight: 600',
      '--tracking-wide',
      'uppercase',
      '--color-fg-muted',
    ])
      expect(rule).toContain(t);
  });
});
