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

async function mount(figures: Figures, now = '2026-10-03T12:00') {
  const { default: W } = await import('./SunriseWidget.vue');
  const el = document.createElement('div');
  createApp(W, { figures, now }).mount(el);
  await nextTick();
  return el;
}

describe('SunriseWidget', () => {
  it('says how long until the next sunrise or sunset in the place', async () => {
    expect((await mount(BASE, '2026-10-03T16:11')).textContent).toContain('Sunset in 2 h 10 min');
    expect((await mount(BASE, '2026-10-03T05:00')).textContent).toContain('Sunrise in 1 h 58 min');
    expect((await mount(BASE, '2026-10-03T20:00')).textContent).not.toContain(' in ');
  });
  it('draws a daylight arc with the sun at the time of day, labelled for screen readers', async () => {
    const el = await mount(BASE, '2026-10-03T12:39');
    const arc = el.querySelector('svg[data-testid="daylight-arc"]')!;
    expect(arc.getAttribute('role')).toBe('img');
    expect(arc.getAttribute('aria-label')).toBe('Sun 50% of the way from sunrise to sunset');
    expect(arc.querySelector('[data-testid="sun-dot"]')).not.toBeNull();
  });
  it('sets labels in the UI face and only the figures in mono', async () => {
    const el = await mount(BASE);
    const nums = [...el.querySelectorAll('.desk-sunrise-num')].map((n) => n.textContent?.trim());
    expect(nums).toEqual(['6 h 21 min', '06:58', '18:21', '11 h 23 min']);
  });
  it('shows place-local sunrise, sunset and day length; the credit lives in the strip, no zone', async () => {
    const text = (await mount(BASE)).textContent ?? '';
    expect(text).toContain('06:58');
    expect(text).toContain('18:21');
    expect(text).toContain('11 h 23 min');
    expect(text).not.toContain('Weather data by Open-Meteo.com');
    expect(text).not.toContain('Manchester');
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
