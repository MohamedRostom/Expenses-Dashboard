import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { WidgetT } from '@desk/contracts';

type Figures = NonNullable<Extract<WidgetT, { kind: 'sunrise' }>['figures']>;
const BASE: Figures = {
  place: 'Manchester',
  sunrise: '2026-10-03T06:58',
  sunset: '2026-10-03T18:21',
  daylightSeconds: 41000,
  placeTimeZone: 'Europe/London',
  showZone: false,
  attribution: 'Weather data by Open-Meteo.com',
};

async function mount(figures: Figures) {
  const { default: W } = await import('./SunriseWidget.vue');
  const el = document.createElement('div');
  createApp(W, { figures }).mount(el);
  await nextTick();
  return el;
}

describe('SunriseWidget', () => {
  it('shows place-local sunrise, sunset, day length and attribution, no zone', async () => {
    const text = (await mount(BASE)).textContent ?? '';
    expect(text).toContain('06:58');
    expect(text).toContain('18:21');
    expect(text).toContain('11 h 23 min');
    expect(text).toContain('Weather data by Open-Meteo.com');
    expect(text).not.toContain('Europe/London');
  });

  it('shows the zone only when showZone', async () => {
    const text = (await mount({ ...BASE, showZone: true })).textContent ?? '';
    expect(text).toContain('Europe/London');
  });

  it('polar day', async () => {
    const text =
      (await mount({ ...BASE, sunrise: null, sunset: null, daylightSeconds: 86400, polar: 'day' }))
        .textContent ?? '';
    expect(text).toContain('Sun up all day');
    expect(text).toContain('24 h');
    expect(text).not.toContain('Sunrise');
  });

  it('polar night', async () => {
    const text =
      (await mount({ ...BASE, sunrise: null, sunset: null, daylightSeconds: 0, polar: 'night' }))
        .textContent ?? '';
    expect(text).toContain('Sun down all day');
    expect(text).toContain('0 h');
  });
});
