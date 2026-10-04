import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WidgetT } from '@desk/contracts';

vi.mock('../../api/widgets.js', () => ({}));
vi.mock('./CurrencyPicker.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      emits: ['toggle'],
      setup:
        (_p, { emit }) =>
        () =>
          h('button', { 'data-testid': 'fake-toggle', onClick: () => emit('toggle', 'EUR') }),
    }),
  };
});

const widget = {
  id: 'w1',
  kind: 'currency',
  position: 0,
  settings: { currencies: ['USD'] },
  state: 'ready',
  asOf: '2026-10-03T12:00:00Z',
} as unknown as WidgetT;

describe('WidgetSettingsSheet errors', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('a 401 saving currencies shows the sign-in prompt, not "Couldn\'t save that change"', async () => {
    const { ApiError } = await import('../../api/client.js');
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWidgetsStore } = await import('../../stores/widgets.js');
    vi.spyOn(useWidgetsStore(), 'patch').mockRejectedValue(
      new ApiError('unauthenticated', 'x', 401),
    );
    const { default: Sheet } = await import('./WidgetSettingsSheet.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(Sheet, { open: true, widget }).use(pinia).mount(el);
    await nextTick();
    document.querySelector<HTMLButtonElement>('[data-testid="fake-toggle"]')!.click();
    await nextTick();
    await nextTick();
    expect(document.body.textContent).toContain('Session expired');
    expect(document.body.textContent).not.toContain("Couldn't save");
  });
});
