// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import ErrorState from './ErrorState.vue';

describe('ErrorState', () => {
  it('is role=alert on first render only', async () => {
    const code = ref('not_found');
    const el = document.createElement('div');
    createApp({ render: () => h(ErrorState, { code: code.value }) }).mount(el);
    const root = () => el.firstElementChild!;
    expect(root().getAttribute('role')).toBe('alert');
    await nextTick();
    expect(root().getAttribute('role')).toBeNull();
    code.value = 'conflict';
    await nextTick();
    expect(root().getAttribute('role')).toBeNull();
    expect(root().textContent).toContain('Conflict');
  });
});
