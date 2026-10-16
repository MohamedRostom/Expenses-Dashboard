// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Skeleton from './Skeleton.vue';

describe('Skeleton', () => {
  it('is hidden from assistive tech', async () => {
    const el = document.createElement('div');
    createApp(Skeleton).mount(el);
    await nextTick();
    expect(el.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
