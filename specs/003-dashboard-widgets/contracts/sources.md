# Source Client Contract: Dashboard Widgets

Two external sources, both `fetch`-only, each with a real client, a fake implementing the same
interface, and recorded fixtures that both are validated against (the rates and Notion pattern in
`packages/connectors`).

## WeatherSource (`packages/connectors/src/open-meteo`)

```text
WeatherSource
  search(query: string): PlaceCandidate[]                 // up to 5; [] when none
  forecast(lat: number, lon: number, timeZone: string): Forecast
  errors: SourcePaused { retryAfterMs } (HTTP 429 or quota body), SourceError (network, 5xx)

PlaceCandidate: { name, admin1?, country, lat, lon, timeZone }   // lat/lon rounded to 2 dp by the client
Forecast: {
  current: { temperatureC, weatherCode, observedAt },
  daily: [{ date, maxC, minC, weatherCode, sunrise, sunset, daylightSeconds }]  // 4 entries, place-local
}
```

- Endpoint mapping: research R1. `weatherCode` is the WMO code as returned; the condition word
  and icon come from `packages/connectors/src/open-meteo/wmo.ts` (Desk-owned table, unit tested
  for every code 0–99).
- The real client sends no headers beyond `Accept: application/json`; no user data is ever in a
  request.
- `OpenMeteoFake` replays fixtures and accepts scripted mutations: `setTemperature(lat, lon,
  c)`, `pauseSource(ms)`, `addPlace(candidate)`; `infra/mocks/src/open-meteo.ts` exposes it on
  the mocks container with control routes for Playwright.

## Rates range (`packages/connectors/src/rates`, existing client extended)

```text
RatesProvider (existing)
  rate(date, from, to): { rate, rateDate, source } | unsupported
  range(from: Date, to: Date, base: string, quotes: string[]): { date, rates: { [quote]: string } }[]   // new
```

- `range` calls `api.frankfurter.app/<from>..<to>?from=<base>&to=<quotes>`; rates are decimal
  strings, never parsed to floats; missing dates (weekends, holidays) are simply absent and the
  backfill job stores only published dates.
- `FakeRates` gains `range` seeded from `fixtures/range-*.json`.

## Fixture and fake rules

- `open-meteo/fixtures/`: `search-manchester.json` (two homonyms with different countries),
  `search-empty.json`, `forecast-manchester.json` (four daily entries with sunrise and sunset,
  a night-time `observedAt`), `forecast-429.json`, `forecast-5xx.txt`.
- `rates/fixtures/`: `range-eur-gbp-31d.json` (31 days with weekend gaps), `range-short.json`
  (a currency with 12 published dates), `range-unsupported.json`.
- A contract test per source runs the real client against the fixtures over a fetch stub and
  the fake against the same fixtures, asserting identical `PlaceCandidate`, `Forecast` and
  range output.
- Fixtures contain no real user data; the place used is a public city.
