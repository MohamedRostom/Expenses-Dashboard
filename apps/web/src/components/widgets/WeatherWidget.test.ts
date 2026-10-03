import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { TemperatureUnitT, WidgetT } from '@desk/contracts';

type Figures = NonNullable<Extract<WidgetT, { kind: 'weather' }>['figures']>;

const FIGURES: Figures = {
  place: 'Manchester',
  temperatureC: 20,
  condition: 'Partly cloudy',
  icon: 'partly-cloudy',
  todayMaxC: 22,
  todayMinC: 10,
  outlook: [
    { date: '2026-10-04', maxC: 18, minC: 8, icon: 'rain' },
    { date: '2026-10-05', maxC: 0, minC: -5, icon: 'snow' },
    { date: '2026-10-06', maxC: 25, minC: 15, icon: 'sun' },
  ],
  observedAt: '2026-10-03T11:40:00Z',
  attribution: 'Weather data by Open-Meteo.com',
};

async function mount(unit: TemperatureUnitT) {
  const { default: WeatherWidget } = await import('./WeatherWidget.vue');
  const el = document.createElement('div');
  createApp(WeatherWidget, { figures: FIGURES, unit }).mount(el);
  await nextTick();
  return el;
}

describe('WeatherWidget', () => {
  it('shows place, temperature, condition, icon, high/low, outlook, as-of and attribution', async () => {
    const el = await mount('C');
    const text = el.textContent ?? '';
    expect(text).toContain('Manchester');
    expect(text).toContain('20°C');
    expect(text).toContain('Partly cloudy');
    expect(text).toContain('H 22°');
    expect(text).toContain('L 10°');
    expect(el.querySelector('[data-icon="partly-cloudy"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="outlook-day"]')).toHaveLength(3);
    expect(el.querySelector('[data-testid="outlook-day"] [data-icon="rain"]')).not.toBeNull();
    expect(text).toMatch(/as of/i);
    expect(text).toContain('Weather data by Open-Meteo.com');
  });

  it('converts to Fahrenheit client-side, rounding only for display', async () => {
    const el = await mount('F');
    const text = el.textContent ?? '';
    expect(text).toContain('68°F'); // 20 C
    expect(text).toContain('H 72°'); // 22 C = 71.6
    expect(text).toContain('L 50°');
    expect(text).toContain('32°'); // 0 C
    expect(text).toContain('23°'); // -5 C
    expect(text).not.toContain('20°C');
  });
});
