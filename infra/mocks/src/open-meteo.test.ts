// Spec 003 T045: the real OpenMeteoClient driven against the Hono mock in-process, proving the mock
// speaks the wire shape the client parses and its control routes steer the shared OpenMeteoFake.
import { describe, expect, it } from 'vitest';
import { OpenMeteoClient } from '@desk/connectors/open-meteo/client';
import { OpenMeteoFake } from '@desk/connectors/open-meteo/fake';
import { SourceError, SourcePaused } from '@desk/connectors/open-meteo';
import { createOpenMeteoMockApp } from './open-meteo.js';

function harness() {
  const app = createOpenMeteoMockApp(new OpenMeteoFake());
  const fetchImpl = ((input: string | URL, init?: RequestInit) =>
    app.request(input, init)) as unknown as typeof fetch;
  const client = new OpenMeteoClient({ fetchImpl, baseUrl: 'http://mocks.test' });
  const control = async (path: string, body?: unknown) => {
    const res = await app.request(`http://mocks.test/__control/open-meteo/${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    expect(res.status).toBe(200);
    return res.json();
  };
  return { client, control };
}

describe('Open-Meteo mock (T045)', () => {
  it('search returns the two Manchesters', async () => {
    const { client } = harness();
    const places = await client.search('manch');
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ name: 'Manchester', country: expect.any(String) });
  });

  it('forecast round-trips a temperature set through the control route', async () => {
    const { client, control } = harness();
    const [p] = await client.search('manch');
    await control('temperature', { lat: p!.lat, lon: p!.lon, c: 21.5 });
    const f = await client.forecast(p!.lat, p!.lon, p!.timeZone);
    expect(f.current.temperatureC).toBe(21.5);
    expect(f.daily).toHaveLength(4);
    expect(f.timeZone).toBe(p!.timeZone);
  });

  it('pause answers 429 with Retry-After and {ms:0} clears it', async () => {
    const { client, control } = harness();
    await control('pause', { ms: 60_000 });
    const err = await client.search('manch').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourcePaused);
    expect((err as SourcePaused).retryAfterMs).toBeGreaterThan(0);
    await control('pause', { ms: 0 });
    await expect(client.search('manch')).resolves.toHaveLength(2);
  });

  it('fail answers 500', async () => {
    const { client, control } = harness();
    await control('fail', { on: true });
    await expect(client.search('manch')).rejects.toBeInstanceOf(SourceError);
    await control('fail', { on: false });
    await expect(client.search('manch')).resolves.toHaveLength(2);
  });

  it.each(['day', 'night'] as const)('polar %s yields null sunrise/sunset', async (mode) => {
    const { client, control } = harness();
    await control('polar', { mode });
    const f = await client.forecast(53.48, -2.24, 'Europe/London');
    expect(f.daily[0]!.sunrise).toBeNull();
    expect(f.daily[0]!.sunset).toBeNull();
    await control('polar', { mode: null });
    expect((await client.forecast(53.48, -2.24, 'Europe/London')).daily[0]!.sunrise).not.toBeNull();
  });

  it('place makes a new candidate searchable', async () => {
    const { client, control } = harness();
    const candidate = {
      name: 'Zzyzx',
      admin1: 'California',
      country: 'United States',
      lat: 35.14,
      lon: -116.1,
      timeZone: 'America/Los_Angeles',
    };
    await control('place', { candidate });
    expect(await client.search('zzy')).toEqual([candidate]);
  });

  it('calls reports the fake counters', async () => {
    const { client, control } = harness();
    await client.search('manch');
    await client.search('manch');
    await client.forecast(53.48, -2.24, 'Europe/London');
    expect(await control('calls')).toEqual({ search: 2, forecast: 1 });
  });
});
