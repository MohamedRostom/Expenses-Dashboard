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
