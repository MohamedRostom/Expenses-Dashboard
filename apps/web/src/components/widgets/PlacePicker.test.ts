import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceCandidateT } from '@desk/contracts';

vi.mock('../../api/places.js', () => ({ searchPlaces: vi.fn(), resolvePlace: vi.fn() }));
vi.mock('../../api/client.js', () => ({
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

const MAN: PlaceCandidateT = {
  name: 'Manchester',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 53.48,
  lon: -2.24,
  timeZone: 'Europe/London',
};

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
};

async function mount(previous?: string) {
  const { default: PlacePicker } = await import('./PlacePicker.vue');
  const onSelect = vi.fn();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(PlacePicker, { previous, onSelect });
  app.mount(el);
  const type = async (v: string) => {
    const input = el.querySelector('input')!;
    input.value = v;
    input.dispatchEvent(new Event('input'));
    await nextTick();
  };
  return { el, app, onSelect, type };
}

describe('PlacePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends nothing for two characters, one request after the debounce for three', async () => {
    const api = await import('../../api/places.js');
    vi.mocked(api.searchPlaces).mockResolvedValue({ candidates: [MAN] });
    const { type, el } = await mount();
    await type('Ma');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.searchPlaces).not.toHaveBeenCalled();
    await type('Man');
    await type('Manc');
    await vi.advanceTimersByTimeAsync(399);
    expect(api.searchPlaces).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(api.searchPlaces).toHaveBeenCalledTimes(1);
    expect(api.searchPlaces).toHaveBeenCalledWith('Manc');
    expect(el.textContent).toContain('Manchester, England, United Kingdom');
  });

  it('emits only the candidate the user taps', async () => {
    const api = await import('../../api/places.js');
    vi.mocked(api.searchPlaces).mockResolvedValue({ candidates: [MAN] });
    const { type, el, onSelect } = await mount();
    await type('Manc');
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(onSelect).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-testid="place-candidate"]')!.click();
    expect(onSelect).toHaveBeenCalledWith(MAN);
  });

  it.each([
    ['rate_limited', 429, 'Please wait a moment before searching again'],
    ['source_paused', 503, 'Place search is paused'],
    ['source_unreachable', 502, 'Place search is unavailable'],
    ['unauthenticated', 401, 'Session expired'],
  ])('branches copy on code %s', async (code, status, copy) => {
    const api = await import('../../api/places.js');
    const { ApiError } = await import('../../api/client.js');
    vi.mocked(api.searchPlaces).mockRejectedValue(
      new (ApiError as unknown as new (c: string, m: string, s: number) => Error)(
        code,
        'x',
        status,
      ),
    );
    const { type, el } = await mount();
    await type('Manc');
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(el.textContent).toContain(copy);
    // panel copy about "the last reading" means nothing in a search box
    expect(el.textContent).not.toContain('last reading');
  });

  it('says the place was not found and keeps the previous one', async () => {
    const api = await import('../../api/places.js');
    vi.mocked(api.searchPlaces).mockResolvedValue({ candidates: [] });
    const { type, el } = await mount('Leeds');
    await type('Zzzz');
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(el.textContent).toContain('Place not found, keeping Leeds');
  });

  it('asks the device only on tap and shows the nearest place for confirmation', async () => {
    const api = await import('../../api/places.js');
    vi.mocked(api.resolvePlace).mockResolvedValue({ candidates: [MAN], approximate: true });
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 53.5, longitude: -2.2 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { el, onSelect } = await mount();
    const btn = el.querySelector<HTMLButtonElement>('[data-testid="use-location"]')!;
    expect(btn.textContent).toContain('ask your device once');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    btn.click();
    await flush();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(api.resolvePlace).toHaveBeenCalledWith(53.5, -2.2);
    expect(el.textContent).toContain('Near Manchester');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('returns to search without a blocking error when the device refuses', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, err: PositionErrorCallback) =>
      err({ code: 1 } as GeolocationPositionError),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { el } = await mount();
    el.querySelector<HTMLButtonElement>('[data-testid="use-location"]')!.click();
    await flush();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('input')).not.toBeNull();
  });
});
