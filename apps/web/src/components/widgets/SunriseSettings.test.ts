import { createApp, defineComponent, h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { PlaceCandidateT, WidgetT } from '@desk/contracts';

vi.mock('./PlacePicker.vue', () => ({
  default: defineComponent({
    emits: ['select'],
    setup:
      (_p, { emit }) =>
      () =>
        h('button', {
          'data-testid': 'fake-pick',
          onClick: () => emit('select', { name: 'Leeds' }),
        }),
  }),
}));

describe('SunriseSettings', () => {
  it('patches the chosen place', async () => {
    const widget = {
      id: 's1',
      kind: 'sunrise',
      place: { name: 'Manchester' } as PlaceCandidateT,
    } as WidgetT;
    const patch = vi.fn().mockResolvedValue(widget);
    const { default: S } = await import('./SunriseSettings.vue');
    const el = document.createElement('div');
    createApp(S, { widget, patch }).mount(el);
    await nextTick();
    el.querySelector<HTMLButtonElement>('[data-testid="fake-pick"]')!.click();
    expect(patch).toHaveBeenCalledWith({ place: { name: 'Leeds' } });
  });
});

describe('SunriseSettings errors', () => {
  it('a 401 saving the place shows the sign-in prompt, not a generic line', async () => {
    const { ApiError } = await import('../../api/client.js');
    const widget = { id: 's1', kind: 'sunrise' } as WidgetT;
    const patch = vi.fn().mockRejectedValue(new ApiError('unauthenticated', 'x', 401));
    const { default: S } = await import('./SunriseSettings.vue');
    const el = document.createElement('div');
    createApp(S, { widget, patch }).mount(el);
    await nextTick();
    el.querySelector<HTMLButtonElement>('[data-testid="fake-pick"]')!.click();
    await nextTick();
    await nextTick();
    expect(el.textContent).toContain('Session expired');
    expect(el.textContent).not.toContain("Couldn't save");
  });
});
