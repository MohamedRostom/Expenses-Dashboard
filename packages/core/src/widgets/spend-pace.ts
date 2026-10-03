export type SpendPace = {
  spentMinor: number;
  budgetMinor: number | null;
  pct: number | null;
  daysLeft: number;
  dailyToBudgetMinor: number | null;
  overBudget: boolean;
};

export function spendPace(
  summary: { tiles: { spent: number } },
  budgets: readonly (number | null)[],
  timeZone: string,
  now: Date,
): SpendPace {
  const spentMinor = summary.tiles.spent;
  const known = budgets.filter((b): b is number => b !== null);
  const budgetMinor = known.length ? known.reduce((a, b) => a + b, 0) : null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const daysLeft = new Date(Date.UTC(n('year'), n('month'), 0)).getUTCDate() - n('day') + 1;

  const overBudget = budgetMinor !== null && spentMinor > budgetMinor;
  return {
    spentMinor,
    budgetMinor,
    pct: budgetMinor ? Math.round((100 * spentMinor) / budgetMinor) : null,
    daysLeft,
    dailyToBudgetMinor:
      budgetMinor === null || overBudget ? null : Math.floor((budgetMinor - spentMinor) / daysLeft),
    overBudget,
  };
}
