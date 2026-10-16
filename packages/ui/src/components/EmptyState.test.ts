// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('renders title, description and the action slot', async () => {
    const el = document.createElement('div');
    createApp({
      render: () =>
        h(
          EmptyState,
          { title: 'Nothing', description: 'Add one' },
          { action: () => h('button', 'Go') },
        ),
    }).mount(el);
    await nextTick();
    expect(el.textContent).toContain('Nothing');
    expect(el.textContent).toContain('Add one');
    expect(el.querySelector('button')).not.toBeNull();
  });
});
