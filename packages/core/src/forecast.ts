export interface ForecastResult {
  total: number;
  basis: string[];
}

/** Month-end forecast per spec: spend to date + remaining fixed-kind budgets not yet incurred
 * + (variable spend so far / days elapsed) * days remaining. `basis` names every input used,
 * or which was missing, so the UI can show what the number accounts for. */
export function forecast(
  spendToDate: number,
  fixedBudgetsRemaining: number,
  variableSpendSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
): ForecastResult {
  const basis: string[] = [];

  if (spendToDate === 0) {
    basis.push('no spend yet');
  } else {
    basis.push('spend to date');
  }

  if (fixedBudgetsRemaining > 0) {
    basis.push('remaining fixed-kind budgets');
  } else {
    basis.push('no fixed-kind budgets');
  }

  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  let runRateContribution = 0;
  if (daysElapsed > 0) {
    const dailyRunRate = variableSpendSoFar / daysElapsed;
    runRateContribution = dailyRunRate * daysRemaining;
    basis.push('variable run-rate');
  } else {
    basis.push('no variable spend history yet');
  }

  const total = spendToDate + fixedBudgetsRemaining + runRateContribution;
  return { total, basis };
}
