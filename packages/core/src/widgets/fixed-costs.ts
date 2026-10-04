export type FixedCostRow = {
  categoryId: string;
  name: string;
  usualMinor: number | null;
  usualBasis: 'budget' | 'previous' | 'none';
};

export type FixedCosts = {
  remaining: FixedCostRow[];
  totalExpectedMinor: number;
  allRecorded: boolean;
  recordedMinor: number;
};

/** Maps are categoryId -> total minor; a key exists only when the month has >= 1 expense. */
export function fixedCosts(
  categories: readonly {
    id: string;
    name: string;
    defaultKind: string;
    budgetMinor: number | null;
  }[],
  thisMonth: ReadonlyMap<string, number>,
  previousMonth: ReadonlyMap<string, number>,
): FixedCosts {
  const fixed = categories.filter((c) => c.defaultKind === 'fixed');
  const remaining = fixed
    .filter((c) => !thisMonth.has(c.id))
    .map((c): FixedCostRow => {
      const prev = previousMonth.get(c.id);
      if (c.budgetMinor !== null)
        return { categoryId: c.id, name: c.name, usualMinor: c.budgetMinor, usualBasis: 'budget' };
      if (prev !== undefined)
        return { categoryId: c.id, name: c.name, usualMinor: prev, usualBasis: 'previous' };
      return { categoryId: c.id, name: c.name, usualMinor: null, usualBasis: 'none' };
    });
  return {
    remaining,
    totalExpectedMinor: remaining.reduce((s, r) => s + (r.usualMinor ?? 0), 0),
    allRecorded: remaining.length === 0,
    recordedMinor: fixed.reduce((s, c) => s + (thisMonth.get(c.id) ?? 0), 0),
  };
}
