import { createApp } from 'vue';
import { describe, expect, it } from 'vitest';
import { ACCENT_IDS } from '@desk/contracts';
import AccentPresets from './AccentPresets.vue';

describe('AccentPresets catalogue row', () => {
  it('renders every preset in both themes, scoped by data-accent and data-theme', () => {
    const el = document.createElement('div');
    createApp(AccentPresets).mount(el);
    for (const id of ACCENT_IDS) {
      for (const t of ['light', 'dark']) {
        const cell = el.querySelector(`[data-accent="${id}"][data-theme="${t}"]`);
        expect(cell, `${id} ${t}`).not.toBeNull();
        expect(cell!.querySelector('button.desk-btn')).not.toBeNull();
        expect(cell!.querySelector('[role="tablist"]')).not.toBeNull();
      }
    }
  });
});
