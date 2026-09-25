import { describe, expect, it } from 'vitest';
import { forecast } from './forecast.js';

describe('forecast', () => {
  it('sums spend to date, remaining fixed budgets and variable run-rate times days left', () => {
    // spend so far 10_000, fixed budgets remaining 5_000, variable spend so far 3_000 over 10
    // elapsed days (run-rate 300/day), 20 days left => run-rate contribution 6_000.
    const result = forecast(10_000, 5_000, 3_000, 10, 30);
    expect(result.total).toBe(10_000 + 5_000 + 300 * 20);
    expect(result.basis).toContain('spend to date');
    expect(result.basis).toContain('remaining fixed-kind budgets');
    expect(result.basis).toContain('variable run-rate');
  });

  it('names missing inputs in basis when there are no fixed budgets', () => {
    const result = forecast(10_000, 0, 3_000, 10, 30);
    expect(result.basis).toContain('spend to date');
    expect(result.basis).toContain('no fixed-kind budgets');
    expect(result.basis).not.toContain('remaining fixed-kind budgets');
  });

  it('names missing inputs in basis when there is no spend at all', () => {
    const result = forecast(0, 5_000, 0, 0, 30);
    expect(result.total).toBe(5_000);
    expect(result.basis).toContain('no spend yet');
  });

  it('treats the variable run-rate as 0 and notes it when no days have elapsed', () => {
    const result = forecast(0, 5_000, 0, 0, 30);
    expect(result.basis).toContain('no variable spend history yet');
  });

  it('handles a month with no fixed budgets and no spend at all', () => {
    const result = forecast(0, 0, 0, 0, 30);
    expect(result.total).toBe(0);
    expect(result.basis).toContain('no fixed-kind budgets');
    expect(result.basis).toContain('no spend yet');
  });
});
