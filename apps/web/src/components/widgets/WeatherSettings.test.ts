import { createPinia, setActivePinia } from 'pinia';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceCandidateT, WidgetT } from '@desk/contracts';

vi.mock('../../api/widgets.js', () => ({}));
vi.mock('../../api/client.js', () => ({
  apiFetch: vi.fn(async () => ({})),
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));
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

const widget = {
  id: 'w1',
  kind: 'weather',
  position: 0,
  settings: {},
  state: 'ready',
  asOf: '2026-10-03T12:00:00Z',
  place: { name: 'Manchester' } as PlaceCandidateT,
} as WidgetT;

describe('WeatherSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches the chosen place and sets the unit through the store', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWidgetsStore } = await import('../../stores/widgets.js');
    const store = useWidgetsStore();
    const setUnit = vi.spyOn(store, 'setTemperatureUnit').mockResolvedValue(undefined);
    const patch = vi.fn().mockResolvedValue(widget);
    const { default: WeatherSettings } = await import('./WeatherSettings.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(WeatherSettings, { widget, patch }).use(pinia).mount(el);
    await nextTick();

    el.querySelector<HTMLButtonElement>('[data-testid="fake-pick"]')!.click();
    expect(patch).toHaveBeenCalledWith({ place: { name: 'Leeds' } });

    el.querySelector<HTMLInputElement>('input[type="radio"][value="F"]')!.click();
    expect(setUnit).toHaveBeenCalledWith('F');
  });
});

describe('WeatherSettings errors', () => {
  async function mountWith(patch: () => Promise<unknown>, setUnit?: () => Promise<void>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWidgetsStore } = await import('../../stores/widgets.js');
    if (setUnit) vi.spyOn(useWidgetsStore(), 'setTemperatureUnit').mockImplementation(setUnit);
    const { default: WeatherSettings } = await import('./WeatherSettings.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(WeatherSettings, { widget, patch }).use(pinia).mount(el);
    await nextTick();
    return el;
  }
  const reject = async (code: string, status: number) => {
    const { ApiError } = await import('../../api/client.js');
    return () =>
      Promise.reject(
        new (ApiError as unknown as new (...a: unknown[]) => Error)(code, 'x', status),
      );
  };

  it('a 401 saving the place shows the sign-in prompt', async () => {
    const el = await mountWith(await reject('unauthenticated', 401));
    el.querySelector<HTMLButtonElement>('[data-testid="fake-pick"]')!.click();
    await nextTick();
    await nextTick();
    expect(el.textContent).toContain('Session expired');
    expect(el.textContent).not.toContain("Couldn't save");
  });

  it('a 401 changing the unit shows the sign-in prompt', async () => {
    const el = await mountWith(vi.fn(), await reject('unauthenticated', 401));
    el.querySelector<HTMLInputElement>('input[type="radio"][value="F"]')!.click();
    await nextTick();
    await nextTick();
    expect(el.textContent).toContain('Session expired');
  });
});
