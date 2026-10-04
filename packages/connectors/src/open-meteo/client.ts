import {
  SourceError,
  SourcePaused,
  type Forecast,
  type PlaceCandidate,
  type WeatherSource,
} from './index.js';

const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Half away from zero to 2 dp; toPrecision(12) absorbs float traps like 1.005 * 100. */
function round2(x: number): number {
  const r = (Math.sign(x) * Math.round(Math.abs(Number((x * 100).toPrecision(12))))) / 100;
  return r === 0 ? 0 : r;
}

type Rec = Record<string, unknown>;

export function mapSearch(body: unknown): PlaceCandidate[] {
  const results = ((body as Rec | null)?.results as Rec[] | undefined) ?? [];
  return results.map((r) => ({
    name: r.name as string,
    ...(typeof r.admin1 === 'string' ? { admin1: r.admin1 } : {}),
    country: r.country as string,
    lat: round2(r.latitude as number),
    lon: round2(r.longitude as number),
    timeZone: r.timezone as string,
  }));
}

export function mapForecast(body: unknown): Forecast {
  const b = body as { timezone: string; current: Rec; daily: Record<string, unknown[]> };
  const d = b.daily;
  const time = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  return {
    timeZone: b.timezone,
    current: {
      temperatureC: b.current.temperature_2m as number,
      weatherCode: b.current.weather_code as number,
      observedAt: b.current.time as string,
    },
    daily: (d.time as string[]).map((date, i) => ({
      date,
      maxC: d.temperature_2m_max![i] as number,
      minC: d.temperature_2m_min![i] as number,
      weatherCode: d.weather_code![i] as number,
      sunrise: time(d.sunrise?.[i]),
      sunset: time(d.sunset?.[i]),
      daylightSeconds: d.daylight_duration![i] as number,
    })),
  };
}

/** Open-Meteo over fetch. No user data in any request; headers are Accept only (ADR-0005). */
export class OpenMeteoClient implements WeatherSource {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string | undefined;
  private readonly now: () => Date;

  constructor(opts: { fetchImpl?: typeof fetch; baseUrl?: string; now?: () => Date } = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    let base = opts.baseUrl;
    while (base?.endsWith('/')) base = base.slice(0, -1);
    this.baseUrl = base;
    this.now = opts.now ?? (() => new Date());
  }

  search(query: string): Promise<PlaceCandidate[]> {
    const base = this.baseUrl ? `${this.baseUrl}/v1/search` : SEARCH_URL;
    const url = `${base}?name=${encodeURIComponent(query)}&count=5&language=en`;
    return this.get(url).then(mapSearch);
  }

  forecast(lat: number, lon: number, timeZone: string): Promise<Forecast> {
    const base = this.baseUrl ? `${this.baseUrl}/v1/forecast` : FORECAST_URL;
    const url =
      `${base}?latitude=${round2(lat)}&longitude=${round2(lon)}` +
      '&current=temperature_2m,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,daylight_duration' +
      `&timezone=${encodeURIComponent(timeZone)}&forecast_days=4`;
    return this.get(url).then(mapForecast);
  }

  private async get(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch (cause) {
      throw new SourceError('open-meteo request failed', { cause });
    }
    if (res.status === 429) {
      const secs = Number(res.headers.get('retry-after'));
      if (res.headers.get('retry-after') && Number.isFinite(secs)) {
        throw new SourcePaused(secs * 1000);
      }
      const n = this.now();
      const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
      throw new SourcePaused(next - n.getTime());
    }
    if (!res.ok) throw new SourceError(`open-meteo responded ${res.status}`);
    try {
      return await res.json();
    } catch (cause) {
      throw new SourceError('open-meteo returned invalid JSON', { cause });
    }
  }
}
