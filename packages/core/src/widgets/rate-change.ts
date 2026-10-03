export type RatePoint = { date: string; rate: string };
export type RateChange = { pct: string; direction: 'up' | 'down' | 'flat'; since?: string };
export type RateChanges = { prevChange: RateChange | null; monthChange: RateChange | null };

const MONTH_DAYS = 30;
const DAY_MS = 86_400_000;

function parseDecimal(value: string): { int: bigint; exp: number } {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new RangeError(`rateChanges: not a decimal rate: ${value}`);
  const [, whole, fraction = ''] = m;
  return { int: BigInt(whole! + fraction), exp: fraction.length };
}

/** Signed percentage change from `from` to `to`, one decimal, rounded half away from zero. */
function change(from: RatePoint, to: RatePoint): RateChange {
  const a = parseDecimal(from.rate);
  const b = parseDecimal(to.rate);
  if (a.int === 0n) throw new RangeError('rateChanges: base rate is zero');
  const exp = Math.max(a.exp, b.exp);
  const x = a.int * 10n ** BigInt(exp - a.exp);
  const y = b.int * 10n ** BigInt(exp - b.exp);
  const diff = y - x;
  const mag = diff < 0n ? -diff : diff;
  // tenths of a percent = mag * 1000 / x, half-up
  const tenths = (mag * 2000n + x) / (x * 2n);
  const pct = `${diff < 0n && tenths > 0n ? '-' : ''}${tenths / 10n}.${tenths % 10n}`;
  const direction = tenths === 0n ? 'flat' : diff > 0n ? 'up' : 'down';
  return { pct, direction, since: from.date };
}

/**
 * Previous change = last two published dates. Month change = last date vs the earliest date at
 * or after last - 30 days; `since` is set only when the first date is later than that cutoff. Input is date-ordered
 * ascending; the 30-day window hangs off the last date, not the clock.
 */
export function rateChanges(history: RatePoint[]): RateChanges {
  if (history.length === 0) throw new RangeError('rateChanges: empty history');
  if (history.length === 1) return { prevChange: null, monthChange: null };
  const last = history[history.length - 1]!;
  const cutoff = new Date(Date.parse(last.date) - MONTH_DAYS * DAY_MS).toISOString().slice(0, 10);
  const base = history.find((p) => p.date >= cutoff)!; // last itself qualifies
  const monthChange = change(base, last);
  // history doesn't reach back 30 calendar days: say where the comparison actually starts
  if (history[0]!.date > cutoff) monthChange.since = history[0]!.date;
  else delete monthChange.since;
  return { prevChange: change(history[history.length - 2]!, last), monthChange };
}
