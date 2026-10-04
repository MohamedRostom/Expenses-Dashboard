import { Hono, type Context } from 'hono';
import { SourceError, SourcePaused, type Forecast } from '@desk/connectors/open-meteo';
import { OpenMeteoFake } from '@desk/connectors/open-meteo/fake';

/** Spec 003: Open-Meteo mock. Serves the fake's data in the wire shape the real client parses. */

// Inverse of the client's mapForecast.
function forecastWire(f: Forecast) {
  const col = <T>(pick: (d: Forecast['daily'][number]) => T) => f.daily.map(pick);
  return {
    timezone: f.timeZone,
    current: {
      time: f.current.observedAt,
      temperature_2m: f.current.temperatureC,
      weather_code: f.current.weatherCode,
    },
    daily: {
      time: col((d) => d.date),
      temperature_2m_max: col((d) => d.maxC),
      temperature_2m_min: col((d) => d.minC),
      weather_code: col((d) => d.weatherCode),
      sunrise: col((d) => d.sunrise ?? ''),
      sunset: col((d) => d.sunset ?? ''),
      daylight_duration: col((d) => d.daylightSeconds),
    },
  };
}

export function createOpenMeteoMockApp(fake = new OpenMeteoFake()): Hono {
  const app = new Hono();

  // Maps the fake's failures to the statuses the real client turns back into SourcePaused/SourceError.
  const serve = async (c: Context, run: () => Promise<unknown>) => {
    try {
      return c.json((await run()) as object);
    } catch (e) {
      if (e instanceof SourcePaused) {
        c.header('Retry-After', String(Math.max(1, Math.ceil(e.retryAfterMs / 1000))));
        return c.json({ error: true, reason: 'paused' }, 429);
      }
      if (e instanceof SourceError) return c.json({ error: true, reason: e.message }, 500);
      throw e;
    }
  };

  app.get('/v1/search', (c) =>
    serve(c, async () => {
      const places = await fake.search(c.req.query('name') ?? '');
      return {
        results: places.map((p) => ({
          name: p.name,
          ...(p.admin1 ? { admin1: p.admin1 } : {}),
          country: p.country,
          latitude: p.lat,
          longitude: p.lon,
          timezone: p.timeZone,
        })),
      };
    }),
  );

  app.get('/v1/forecast', (c) =>
    serve(c, async () =>
      forecastWire(
        await fake.forecast(
          Number(c.req.query('latitude')),
          Number(c.req.query('longitude')),
          c.req.query('timezone') ?? 'auto',
        ),
      ),
    ),
  );

  const ctl = '/__control/open-meteo';
  app.post(`${ctl}/temperature`, async (c) => {
    const { lat, lon, c: temp } = await c.req.json<{ lat: number; lon: number; c: number }>();
    fake.setTemperature(lat, lon, temp);
    return c.json({ ok: true });
  });
  app.post(`${ctl}/pause`, async (c) => {
    fake.pauseSource((await c.req.json<{ ms: number }>()).ms);
    return c.json({ ok: true });
  });
  app.post(`${ctl}/fail`, async (c) => {
    fake.failAll((await c.req.json<{ on: boolean }>()).on);
    return c.json({ ok: true });
  });
  app.post(`${ctl}/polar`, async (c) => {
    fake.usePolar((await c.req.json<{ mode: 'day' | 'night' | null }>()).mode);
    return c.json({ ok: true });
  });
  app.post(`${ctl}/place`, async (c) => {
    fake.addPlace(
      (await c.req.json<{ candidate: Parameters<OpenMeteoFake['addPlace']>[0] }>()).candidate,
    );
    return c.json({ ok: true });
  });
  app.get(`${ctl}/calls`, (c) => c.json(fake.calls));

  return app;
}
