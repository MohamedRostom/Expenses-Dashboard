import { describe, expect, it } from 'vitest';
import { clockIn, daylightFraction, nextSunEvent, summary } from './widget-summary.js';

const SUN = {
  place: 'Cambridge',
  sunrise: '2026-11-25T07:36',
  sunset: '2026-11-25T15:55',
  daylightSeconds: 29940,
  placeTimeZone: 'Europe/London',
  showZone: false,
  attribution: 'Weather data by Open-Meteo.com' as const,
};

describe('clockIn', () => {
  it("gives the place's local wall time, not the device's", () => {
    expect(clockIn('Asia/Tokyo', new Date('2026-11-25T00:30:00Z'))).toBe('2026-11-25T09:30');
  });
});

describe('nextSunEvent', () => {
  it('before sunrise: sunrise, with the time left', () => {
    expect(nextSunEvent(SUN, '2026-11-25T05:00')).toEqual({ label: 'Sunrise', in: '2 h 36 min' });
  });
  it('during the day: sunset', () => {
    expect(nextSunEvent(SUN, '2026-11-25T13:45')).toEqual({ label: 'Sunset', in: '2 h 10 min' });
  });
  it('after sunset, or under polar day/night: nothing', () => {
    expect(nextSunEvent(SUN, '2026-11-25T18:03')).toBeNull();
    expect(
      nextSunEvent({ ...SUN, polar: 'day', sunrise: null, sunset: null }, '2026-11-25T12:00'),
    ).toBeNull();
  });
});

describe('daylightFraction', () => {
  it('is 0 at sunrise, 0.5 at midday, 1 at sunset, clamped outside', () => {
    expect(daylightFraction(SUN, '2026-11-25T07:36')).toBe(0);
    expect(daylightFraction(SUN, '2026-11-25T15:55')).toBe(1);
    expect(daylightFraction(SUN, '2026-11-25T11:45')).toBeCloseTo(0.5, 2);
    expect(daylightFraction(SUN, '2026-11-25T03:00')).toBe(0);
    expect(daylightFraction(SUN, '2026-11-25T22:00')).toBe(1);
  });
});

describe('summary: one line per widget for the compact phone strip', () => {
  const now = '2026-11-25T13:45';
  it('weather: temperature, condition, high and low in the chosen unit', () => {
    const figures = {
      place: 'Cambridge',
      temperatureC: 5,
      condition: 'Overcast',
      icon: 'cloud',
      todayMaxC: 7,
      todayMinC: 1,
      outlook: [],
      observedAt: '2026-11-25T18:00:00Z',
      attribution: 'Weather data by Open-Meteo.com' as const,
    };
    expect(summary({ kind: 'weather', figures }, 'C', now)).toBe('5° Overcast · H 7° L 1°');
    expect(summary({ kind: 'weather', figures }, 'F', now)).toBe('41° Overcast · H 45° L 34°');
  });
  it('sunrise: the next event and how long until it', () => {
    expect(summary({ kind: 'sunrise', figures: SUN }, 'C', now)).toBe(
      'Sunset 15:55 · in 2 h 10 min',
    );
    expect(summary({ kind: 'sunrise', figures: SUN }, 'C', '2026-11-25T18:00')).toBe(
      'Sunrise 07:36 · Sunset 15:55',
    );
  });
  it('currency: the first quoted rate', () => {
    const figures = {
      rows: [
        { code: 'GBP', isDefault: true as const },
        { code: 'EUR', rate: 0.85033, rateDate: '2026-11-25', prevChange: null, monthChange: null },
      ],
    };
    expect(summary({ kind: 'currency', figures }, 'C', now)).toBe('EUR 0.85033');
  });
  it('spend pace and fixed costs', () => {
    expect(
      summary(
        {
          kind: 'spend_pace',
          figures: {
            spentMinor: 1,
            budgetMinor: 2,
            pct: 48.6,
            daysLeft: 6,
            dailyToBudgetMinor: 1,
            overBudget: false,
          },
        },
        'C',
        now,
      ),
    ).toBe('49% of budget · 6 days left');
    expect(
      summary(
        {
          kind: 'fixed_costs',
          figures: {
            remaining: [{ categoryId: 'c', name: 'Rent', usualMinor: 1, usualBasis: 'budget' }],
            totalExpectedMinor: 1,
            allRecorded: false,
          },
        },
        'C',
        now,
      ),
    ).toBe('1 still to record');
  });
  it('no figures yet: no summary', () => {
    expect(summary({ kind: 'weather' }, 'C', now)).toBeNull();
  });
});
