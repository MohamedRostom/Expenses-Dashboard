import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import BootError from './BootError.vue';

describe('BootError', () => {
  it('shows the error state for the code with a Retry that emits retry', async () => {
    const onRetry = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(BootError, { code: 'rate_limited', onRetry }).mount(el);
    // ErrorState announces on first render only, so check before the next tick drops the role.
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    await nextTick();
    expect(el.querySelector('.desk-error-title')?.textContent).toBe('Slow down');
    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'));
    expect(retry).toBeDefined();
    retry!.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
