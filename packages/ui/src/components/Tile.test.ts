// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Tile from './Tile.vue';

async function mount(props: Record<string, unknown>, slots = {}) {
  const el = document.createElement('div');
  createApp({ render: () => h(Tile, props as { label: string }, slots) }).mount(el);
  await nextTick();
  return el;
}

describe('Tile', () => {
  it('renders the figure as the first text node, then label and note', async () => {
    const el = await mount({ label: 'Forecast', value: '£1.00', note: 'Based on: spend.' });
    const first = document
      .createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.textContent?.trim() ? 1 : 3),
      })
      .nextNode();
    expect(first?.textContent).toBe('£1.00');
    expect(el.textContent).toContain('Forecast');
    expect(el.textContent).toContain('Based on: spend.');
  });

  it('shows a skeleton while loading and the slot when there is no value', async () => {
    expect(
      (await mount({ label: 'F', loading: true })).querySelector('[class*="skeleton"]'),
    ).not.toBeNull();
    const el = await mount({ label: 'F' }, { default: () => h('p', { class: 'err' }, 'oops') });
    expect(el.querySelector('.err')).not.toBeNull();
  });

  it('critical variant adds a modifier class', async () => {
    const el = await mount({ label: 'F', value: '1', variant: 'critical' });
    expect(el.querySelector('.desk-tile-value--critical')).not.toBeNull();
  });
});

describe('Tile primary figure (T032)', () => {
  it('marks the primary figure and every figure as a tile amount', async () => {
    const el = await mount({ label: 'Left this month', value: '£1.00', primary: true });
    expect(el.querySelectorAll('[data-tile-primary="figure"]')).toHaveLength(1);
    expect(el.querySelector('[data-tile-primary="figure"]')?.textContent).toBe('£1.00');
    expect(el.querySelector('[data-tile]')).not.toBeNull();
    const plain = await mount({ label: 'Spent', value: '£2.00' });
    expect(plain.querySelector('[data-tile-primary]')).toBeNull();
    expect(plain.querySelector('[data-testid="tile-amount"]')?.textContent).toBe('£2.00');
  });

  it('prints status words with their tone, after the note', async () => {
    const el = await mount({
      label: 'Spent',
      value: '£2.00',
      status: [{ text: '1 rate pending', tone: 'warn' }],
    });
    const w = el.querySelector('.desk-tile-status--warn');
    expect(w?.textContent).toBe('1 rate pending');
  });
});

describe('Tile surface (T012)', () => {
  it('carries the shared .surface class', async () => {
    const el = await mount({ label: 'Forecast', value: '£1.00' });
    expect(el.querySelector('[data-tile]')?.classList.contains('surface')).toBe(true);
  });
});

describe('Tile accent ring (T044)', () => {
  it('primary carries the ring class, critical switches its colour, secondary has none', async () => {
    const ok = (await mount({ label: 'L', value: '1', primary: true })).querySelector(
      '[data-tile]',
    )!;
    expect(ok.classList.contains('desk-tile-block--primary')).toBe(true);
    expect(ok.classList.contains('desk-tile-block--critical')).toBe(false);
    const bad = (
      await mount({ label: 'L', value: '1', primary: true, variant: 'critical' })
    ).querySelector('[data-tile]')!;
    expect(bad.classList.contains('desk-tile-block--critical')).toBe(true);
    const plain = (await mount({ label: 'L', value: '1' })).querySelector('[data-tile]')!;
    expect(plain.classList.contains('desk-tile-block--primary')).toBe(false);
  });

  it('secondary figures are 26px and the ring is a 1px inset accent shadow', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/Tile.vue', 'utf8');
    expect(src).toContain('font-size: var(--text-figure)');
    expect(src).toContain('inset 0 0 0 1px var(--color-accent)');
    expect(src).toContain('inset 0 0 0 1px var(--color-critical)');
    // The ring adds to the raised shadow; a scoped box-shadow alone would drop the elevation.
    expect(src.match(/var\(--shadow-raised\),\s*inset 0 0 0 1px/g)).toHaveLength(2);
  });
});

describe('Tile hero (T048)', () => {
  it('the hero figure sits plainly in the ring: no seam cell or hinge ticks', async () => {
    const el = await mount({ label: 'Left', value: '£1.00', primary: true });
    expect(el.querySelector('[class*="seam"]')).toBeNull();
    expect(el.querySelector('[data-tile-primary="figure"]')).not.toBeNull();
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/components/Tile.vue', 'utf8')).not.toContain('seam');
  });

  it('words replace the figure with secondary-size sans text on one line', async () => {
    const el = await mount({ label: 'Left', value: 'No budget set', primary: true, words: true });
    const v = el.querySelector('[data-tile-primary="figure"]')!;
    expect(v.classList.contains('desk-tile-value--words')).toBe(true);
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/Tile.vue', 'utf8');
    const rule = src.match(/\.desk-tile-block--primary \.desk-tile-value--words \{[^}]*\}/)![0];
    expect(rule).toContain('font-family: var(--font-sans)');
    expect(rule).toContain('font-size: var(--text-lg)');
    expect(rule).toContain('white-space: nowrap');
    const plain = await mount({ label: 'Left', value: '£1.00', primary: true });
    expect(plain.querySelector('.desk-tile-value--words')).toBeNull();
  });
});
