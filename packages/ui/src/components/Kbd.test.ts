// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Kbd from './Kbd.vue';

describe('Kbd', () => {
  it('renders its slot in a <kbd>', async () => {
    const el = document.createElement('div');
    createApp({ render: () => h(Kbd, null, () => 'Ctrl') }).mount(el);
    await nextTick();
    expect(el.querySelector('kbd')!.textContent).toBe('Ctrl');
  });
});
