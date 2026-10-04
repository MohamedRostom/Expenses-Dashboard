/** Half away from zero to 2 decimals; toPrecision(12) absorbs float traps like 1.005*100. */
export function roundCoord(x: number): number {
  const s = Number((x * 100).toPrecision(12));
  const r = (Math.sign(s) * Math.round(Math.abs(s))) / 100;
  return r === 0 ? 0 : r;
}

export function cacheKey(lat: number, lon: number): string {
  return `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`;
}

export function normaliseQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function nearest<T extends { lat: number; lon: number }>(
  candidates: readonly T[],
  lat: number,
  lon: number,
  radiusDeg: number,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.lat - lat, c.lon - lon);
    if (d <= radiusDeg && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
