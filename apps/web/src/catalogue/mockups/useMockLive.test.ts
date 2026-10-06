import { createApp, defineComponent, h, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PACE_MS, RATE_MS, WEATHER_MS, useMockLive } from './useMockLive.js';

const route = reactive({ query: {} as Record<string, string> });
vi.mock('vue-router', () => ({ useRoute: () => route }));

type Live = ReturnType<typeof useMockLive>;
function mountLive(opts?: Parameters<typeof useMockLive>[0]) {
  let live!: Live;
  const app = createApp(
    defineComponent({
      setup() {
        live = useMockLive(opts);
        return () => h('div');
      },
    }),
  );
  app.mount(document.createElement('div'));
  return { live, unmount: () => app.unmount() };
}

beforeEach(() => {
  vi.useFakeTimers();
  route.query = {};
});
afterEach(() => vi.useRealTimers());

describe('useMockLive', () => {
  it('?live=off schedules no timers at all', () => {
    route.query = { live: 'off' };
    const { live } = mountLive();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(live.live.value).toBe(false);
    expect(live.rate.arrived.value).toBe(false);
    expect(live.rate.changed.value).toBe(0);
  });

  it('any other live value, or none, is on', () => {
    route.query = { live: 'on' };
    expect(mountLive().live.live.value).toBe(true);
    route.query = {};
    expect(mountLive().live.live.value).toBe(true);
  });

  it('?state=rate-arrives still works as an alias', () => {
    route.query = { state: 'rate-arrives' };
    const { live } = mountLive();
    vi.advanceTimersByTime(RATE_MS);
    expect(live.rate.arrived.value).toBe(true);
  });

  it('the rate arrives once, about 1.2 s after mount', () => {
    const { live } = mountLive();
    expect(RATE_MS).toBe(1200);
    vi.advanceTimersByTime(RATE_MS - 1);
    expect(live.rate.arrived.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(live.rate.arrived.value).toBe(true);
    expect(live.rate.changed.value).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(live.rate.changed.value).toBe(1);
  });

  it('weather refresh ticks at a fixed interval and is cleared on unmount', () => {
    const { live, unmount } = mountLive();
    expect(live.weather.changed.value).toBe(0);
    const first = live.weather.value.value;
    vi.advanceTimersByTime(WEATHER_MS * 3);
    expect(live.weather.changed.value).toBe(3);
    expect(live.weather.value.value).not.toBe(first);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(WEATHER_MS * 3);
    expect(live.weather.changed.value).toBe(3);
  });

  it('the pace marker advances a day per step and clamps at month end', () => {
    const { live } = mountLive({ monthDays: 30, startDay: 28 });
    expect(live.pace.value.value).toBe(28);
    vi.advanceTimersByTime(PACE_MS);
    expect(live.pace.value.value).toBe(29);
    vi.advanceTimersByTime(PACE_MS * 10);
    expect(live.pace.value.value).toBe(30);
    expect(live.pace.changed.value).toBe(2);
  });

  it('every value starts with changed = 0 so first render never flips', () => {
    const { live } = mountLive();
    expect([live.rate.changed.value, live.weather.changed.value, live.pace.changed.value]).toEqual([
      0, 0, 0,
    ]);
  });
});
