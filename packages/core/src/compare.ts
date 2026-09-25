export interface MonthSummaryLike {
  spent: number;
  byCategory: { id: string; spent: number }[];
}

export interface CompareResult {
  deltaTotal: number;
  deltaPercent: number | null;
  byCategory: { id: string; deltaMinor: number }[];
}

/** Simple month-over-month comparison; `deltaPercent` is null when the previous month had no
 * spend, avoiding a divide-by-zero. */
export function compareMonths(
  current: MonthSummaryLike,
  previous: MonthSummaryLike,
): CompareResult {
  const deltaTotal = current.spent - previous.spent;
  const deltaPercent = previous.spent === 0 ? null : (deltaTotal / previous.spent) * 100;

  const ids = new Set<string>([
    ...current.byCategory.map((c) => c.id),
    ...previous.byCategory.map((c) => c.id),
  ]);
  const currentById = new Map(current.byCategory.map((c) => [c.id, c.spent]));
  const previousById = new Map(previous.byCategory.map((c) => [c.id, c.spent]));

  const byCategory = [...ids].map((id) => ({
    id,
    deltaMinor: (currentById.get(id) ?? 0) - (previousById.get(id) ?? 0),
  }));

  return { deltaTotal, deltaPercent, byCategory };
}
