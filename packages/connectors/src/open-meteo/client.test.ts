import { describe, expect, it, vi } from 'vitest';
import searchManchester from './fixtures/search-manchester.json' with { type: 'json' };
import searchEmpty from './fixtures/search-empty.json' with { type: 'json' };
import forecastManchester from './fixtures/forecast-manchester.json' with { type: 'json' };
import polarDay from './fixtures/forecast-polar-day.json' with { type: 'json' };
import polarNight from './fixtures/forecast-polar-night.json' with { type: 'json' };
import forecast429 from './fixtures/forecast-429.json' with { type: 'json' };
import { OpenMeteoClient } from './client.js';
import { OpenMeteoFake } from './fake.js';
import { SourceError, SourcePaused, type WeatherSource } from './index.js';

type Fixture = { response: { status: number; headers?: Record<string, string>; body: unknown } };

function stub(fixture: Fixture) {
  return vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed params so mock.calls carries url/init
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(fixture.response.body), {
        status: fixture.response.status,
        ...(fixture.response.headers ? { headers: fixture.response.headers } : {}),
      }),
  );
}
const asFetch = (f: ReturnType<typeof stub>) => f as unknown as typeof fetch;

describe.each<[string, (fixture: Fixture, polar?: 'day' | 'night') => WeatherSource]>([
  ['OpenMeteoClient', (fixture) => new OpenMeteoClient({ fetchImpl: asFetch(stub(fixture)) })],
  [
    'OpenMeteoFake',
    (_f, polar) => {
      const f = new OpenMeteoFake();
      if (polar) f.usePolar(polar);
      return f;
    },
  ],
])('%s', (_name, make) => {
  it('search returns two homonyms with rounded coordinates', async () => {
    const r = await make(searchManchester).search('manch');
    expect(r).toEqual([
      {
        name: 'Manchester',
        admin1: 'England',
        country: 'United Kingdom',
        lat: 53.48,
        lon: -2.24,
        timeZone: 'Europe/London',
      },
      {
        name: 'Manchester',
        admin1: 'New Hampshire',
        country: 'United States',
        lat: 43,
        lon: -71.45,
        timeZone: 'America/New_York',
      },
    ]);
  });

  it('search with no results returns []', async () => {
    expect(await make(searchEmpty).search('zzzzqqq')).toEqual([]);
  });

  it('forecast returns current, timeZone and four daily entries', async () => {
    const r = await make(forecastManchester).forecast(53.48, -2.24, 'Europe/London');
    expect(r.timeZone).toBe('Europe/London');
    expect(r.current).toEqual({
      temperatureC: 9.4,
      weatherCode: 3,
      observedAt: '2026-10-03T23:00',
    });
    expect(r.daily).toHaveLength(4);
    expect(r.daily[0]).toEqual({
      date: '2026-10-03',
      maxC: 14.2,
      minC: 8.1,
      weatherCode: 3,
      sunrise: '2026-10-03T07:05',
      sunset: '2026-10-03T18:42',
      daylightSeconds: 41820.5,
    });
  });

  it.each([
    ['day', polarDay, 86400],
    ['night', polarNight, 0],
  ] as const)('polar %s has null sunrise and sunset', async (kind, fixture, secs) => {
    const r = await make(fixture, kind).forecast(78.22, 15.63, 'Arctic/Longyearbyen');
    for (const d of r.daily) {
      expect(d.sunrise).toBeNull();
      expect(d.sunset).toBeNull();
      expect(d.daylightSeconds).toBe(secs);
    }
  });
});

describe('OpenMeteoClient (real only)', () => {
  it('429 with retry-after throws SourcePaused', async () => {
    const c = new OpenMeteoClient({ fetchImpl: asFetch(stub(forecast429)) });
    const err = await c.forecast(53.48, -2.24, 'Europe/London').catch((e) => e);
    expect(err).toBeInstanceOf(SourcePaused);
    expect(err.retryAfterMs).toBe(3_600_000);
  });

  it('429 without retry-after waits until next UTC midnight', async () => {
    const f = stub({ response: { status: 429, body: {} } });
    const c = new OpenMeteoClient({
      fetchImpl: asFetch(f),
      now: () => new Date('2026-10-03T22:00:00Z'),
    });
    const err = await c.search('x').catch((e) => e);
    expect(err).toBeInstanceOf(SourcePaused);
    expect(err.retryAfterMs).toBe(2 * 3_600_000);
  });

  it('5xx throws SourceError', async () => {
    const f = vi.fn(async () => new Response('upstream connect error', { status: 502 }));
    const c = new OpenMeteoClient({ fetchImpl: f as unknown as typeof fetch });
    await expect(c.search('x')).rejects.toBeInstanceOf(SourceError);
  });

  it('rejecting fetch throws SourceError', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('network');
    });
    const c = new OpenMeteoClient({ fetchImpl: f as unknown as typeof fetch });
    await expect(c.forecast(1, 2, 'UTC')).rejects.toBeInstanceOf(SourceError);
  });

  it('sends only Accept header and no user data in the URL; rounds coordinates', async () => {
    const f = stub(forecastManchester);
    const c = new OpenMeteoClient({ fetchImpl: asFetch(f) });
    await c.forecast(53.48095, -2.23743, 'Europe/London');
    const [url, init] = f.mock.calls[0]!;
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    const u = new URL(String(url));
    expect(u.host).toBe('api.open-meteo.com');
    expect(u.searchParams.get('latitude')).toBe('53.48');
    expect(u.searchParams.get('longitude')).toBe('-2.24');
    expect(u.searchParams.get('timezone')).toBe('Europe/London');
    expect(u.searchParams.get('forecast_days')).toBe('4');
  });

  it('search hits the geocoding host; baseUrl redirects both calls', async () => {
    const f = stub(searchManchester);
    await new OpenMeteoClient({ fetchImpl: asFetch(f) }).search('manch');
    expect(String(f.mock.calls[0]![0])).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=manch&count=5&language=en',
    );
    expect(f.mock.calls[0]![1]?.headers).toEqual({ Accept: 'application/json' });

    const g = stub(forecastManchester);
    const c = new OpenMeteoClient({
      fetchImpl: asFetch(g),
      baseUrl: 'http://mocks:4000/open-meteo',
    });
    await c.search('x');
    await c.forecast(1, 2, 'UTC');
    expect(String(g.mock.calls[0]![0])).toMatch(/^http:\/\/mocks:4000\/open-meteo\/v1\/search\?/);
    expect(String(g.mock.calls[1]![0])).toMatch(/^http:\/\/mocks:4000\/open-meteo\/v1\/forecast\?/);
  });
});

describe('OpenMeteoFake controls', () => {
  it('counts calls, even when throwing', async () => {
    const f = new OpenMeteoFake();
    f.failAll(true);
    await expect(f.search('m')).rejects.toBeInstanceOf(SourceError);
    await expect(f.forecast(1, 2, 'UTC')).rejects.toBeInstanceOf(SourceError);
    expect(f.calls).toEqual({ search: 1, forecast: 1 });
  });

  it('pauseSource throws SourcePaused until cleared', async () => {
    const f = new OpenMeteoFake();
    f.pauseSource(60_000);
    await expect(f.search('m')).rejects.toBeInstanceOf(SourcePaused);
    f.pauseSource(0);
    await expect(f.search('manch')).resolves.toHaveLength(2);
  });

  it('setTemperature overrides current temperature', async () => {
    const f = new OpenMeteoFake();
    f.setTemperature(53.48, -2.24, 21.5);
    expect((await f.forecast(53.48, -2.24, 'Europe/London')).current.temperatureC).toBe(21.5);
  });

  it('addPlace is searchable; auto timezone resolves to nearest place', async () => {
    const f = new OpenMeteoFake();
    f.addPlace({
      name: 'Zurich',
      country: 'Switzerland',
      lat: 47.37,
      lon: 8.54,
      timeZone: 'Europe/Zurich',
    });
    expect(await f.search('ZUR')).toHaveLength(1);
    expect((await f.forecast(47.37, 8.54, 'auto')).timeZone).toBe('Europe/Zurich');
    expect((await new OpenMeteoFake().forecast(0, 0, 'auto')).timeZone).toBeTruthy();
  });
});
