// Desk-owned WMO weather code table (spec 003 contracts/sources.md). Icons are Desk's own set.

export const WEATHER_ICONS = [
  'sun',
  'partly-cloudy',
  'cloud',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'thunder',
] as const;
export type WeatherIcon = (typeof WEATHER_ICONS)[number];

type Entry = { condition: string; icon: WeatherIcon };

const TABLE: Record<number, Entry> = {
  0: { condition: 'Clear sky', icon: 'sun' },
  1: { condition: 'Mainly clear', icon: 'sun' },
  2: { condition: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { condition: 'Overcast', icon: 'cloud' },
  45: { condition: 'Fog', icon: 'fog' },
  48: { condition: 'Rime fog', icon: 'fog' },
  51: { condition: 'Light drizzle', icon: 'drizzle' },
  53: { condition: 'Drizzle', icon: 'drizzle' },
  55: { condition: 'Heavy drizzle', icon: 'drizzle' },
  56: { condition: 'Light freezing drizzle', icon: 'drizzle' },
  57: { condition: 'Freezing drizzle', icon: 'drizzle' },
  61: { condition: 'Light rain', icon: 'rain' },
  63: { condition: 'Rain', icon: 'rain' },
  65: { condition: 'Heavy rain', icon: 'rain' },
  66: { condition: 'Light freezing rain', icon: 'rain' },
  67: { condition: 'Freezing rain', icon: 'rain' },
  71: { condition: 'Light snow', icon: 'snow' },
  73: { condition: 'Snow', icon: 'snow' },
  75: { condition: 'Heavy snow', icon: 'snow' },
  77: { condition: 'Snow grains', icon: 'snow' },
  80: { condition: 'Light showers', icon: 'rain' },
  81: { condition: 'Showers', icon: 'rain' },
  82: { condition: 'Heavy showers', icon: 'rain' },
  85: { condition: 'Light snow showers', icon: 'snow' },
  86: { condition: 'Heavy snow showers', icon: 'snow' },
  95: { condition: 'Thunderstorm', icon: 'thunder' },
  96: { condition: 'Thunderstorm with hail', icon: 'thunder' },
  99: { condition: 'Severe thunderstorm with hail', icon: 'thunder' },
};

const UNKNOWN: Entry = { condition: 'Unknown', icon: 'cloud' };

/** Published codes map directly; other ints 0..99 use the nearest lower published code. */
export function wmo(code: number): Entry {
  if (!Number.isInteger(code) || code < 0 || code > 99) return UNKNOWN;
  for (let c = code; c >= 0; c--) {
    const e = TABLE[c];
    if (e) return { ...e };
  }
  return UNKNOWN;
}
