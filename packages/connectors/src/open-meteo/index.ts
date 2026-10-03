// Spec 003 contracts/sources.md: WeatherSource (Open-Meteo). Real client and fake come later.

export interface PlaceCandidate {
  name: string;
  admin1?: string;
  country: string;
  lat: number; // rounded to 2 dp by the client
  lon: number;
  timeZone: string;
}

export interface Forecast {
  current: { temperatureC: number; weatherCode: number; observedAt: string };
  /** 4 entries, place-local dates. */
  daily: {
    date: string;
    maxC: number;
    minC: number;
    weatherCode: number;
    sunrise: string | null;
    sunset: string | null;
    daylightSeconds: number;
  }[];
}

export interface WeatherSource {
  /** Up to 5 candidates; [] when none. */
  search(query: string): Promise<PlaceCandidate[]>;
  forecast(lat: number, lon: number, timeZone: string): Promise<Forecast>;
}

/** HTTP 429 or quota body. */
export class SourcePaused extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`source paused for ${retryAfterMs}ms`);
    this.name = 'SourcePaused';
  }
}

/** Network failure or 5xx. */
export class SourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SourceError';
  }
}
