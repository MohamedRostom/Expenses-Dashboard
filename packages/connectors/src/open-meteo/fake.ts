import searchManchester from './fixtures/search-manchester.json' with { type: 'json' };
import forecastManchester from './fixtures/forecast-manchester.json' with { type: 'json' };
import polarDay from './fixtures/forecast-polar-day.json' with { type: 'json' };
import polarNight from './fixtures/forecast-polar-night.json' with { type: 'json' };
import { mapForecast, mapSearch } from './client.js';
import {
  SourceError,
  SourcePaused,
  type Forecast,
  type PlaceCandidate,
  type WeatherSource,
} from './index.js';

const key = (lat: number, lon: number) => `${lat.toFixed(2)}|${lon.toFixed(2)}`;

/** Deterministic WeatherSource replaying the recorded fixtures, for tests, mocks and e2e-ci. */
export class OpenMeteoFake implements WeatherSource {
  readonly calls = { search: 0, forecast: 0 };
  private readonly places: PlaceCandidate[] = mapSearch(searchManchester.response.body);
  private readonly temps = new Map<string, number>();
  private pausedUntil = 0;
  private failing = false;
  private polar: 'day' | 'night' | null = null;

  setTemperature(lat: number, lon: number, c: number): void {
    this.temps.set(key(lat, lon), c);
  }

  /** ms > 0: throw SourcePaused until that long from now; 0 clears. */
  pauseSource(ms: number): void {
    this.pausedUntil = ms > 0 ? Date.now() + ms : 0;
  }

  failAll(on: boolean): void {
    this.failing = on;
  }

  addPlace(candidate: PlaceCandidate): void {
    this.places.push(candidate);
  }

  usePolar(kind: 'day' | 'night' | null): void {
    this.polar = kind;
  }

  private guard(): void {
    if (this.failing) throw new SourceError('OpenMeteoFake: failing');
    if (Date.now() < this.pausedUntil) throw new SourcePaused(this.pausedUntil - Date.now());
  }

  async search(query: string): Promise<PlaceCandidate[]> {
    this.calls.search++;
    this.guard();
    const q = query.trim().toLowerCase();
    return this.places.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 5);
  }

  async forecast(lat: number, lon: number, timeZone: string): Promise<Forecast> {
    this.calls.forecast++;
    this.guard();
    const src =
      this.polar === 'day' ? polarDay : this.polar === 'night' ? polarNight : forecastManchester;
    const f = mapForecast(src.response.body);
    if (timeZone === 'auto') {
      // Nearest known place's zone, default Europe/London.
      let best: PlaceCandidate | undefined;
      let bestD = Infinity;
      for (const p of this.places) {
        const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
        if (d < bestD) [best, bestD] = [p, d];
      }
      f.timeZone = best?.timeZone ?? 'Europe/London';
    } else {
      f.timeZone = timeZone;
    }
    const t = this.temps.get(key(lat, lon));
    if (t !== undefined) f.current.temperatureC = t;
    return f;
  }
}
