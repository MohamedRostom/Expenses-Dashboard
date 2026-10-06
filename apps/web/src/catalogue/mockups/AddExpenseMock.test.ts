import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAmount, resetMockExpenses, toDefault } from './mockExpenses.js';
import { byLabel, flush, mountAt } from './testMount.js';

describe('parseAmount (integer minor units)', () => {
  it.each([
    ['12.50', 1250],
    ['12.5', 1250],
    ['12', 1200],
    ['0.07', 7],
    [' 52.00 ', 5200],
  ])('%s -> %i', (s, minor) => expect(parseAmount(s)).toEqual({ minor }));

  it('rejects three decimals with a message', () => {
    expect(parseAmount('12.345')).toEqual({ error: expect.stringMatching(/two decimal places/i) });
  });
  it.each(['', '  ', 'abc', '-5', '0', '0.00'])('rejects %j', (s) =>
    expect(parseAmount(s)).toHaveProperty('error'),
  );
  it('converts other currencies to whole pence', () => {
    expect(Number.isInteger(toDefault(5200, 'USD'))).toBe(true);
    expect(toDefault(1250, 'GBP')).toBe(1250);
  });
});

describe('sheet', () => {
  beforeEach(resetMockExpenses);
  afterEach(() => document.body.replaceChildren());
  const amount = () =>
    byLabel(document.querySelector('[role="dialog"]')!, 'Amount') as HTMLInputElement;

  it('direct load shows the prefilled demo', async () => {
    const m = await mountAt('/__ui/mockups/add-expense?live=off');
    expect(amount().value).toBe('52.00');
    m.unmount();
  });

  it('opened from the board it starts blank and keeps ?live=off', async () => {
    const m = await mountAt('/__ui/mockups/month-view?live=off');
    (m.el.querySelector('[data-testid="add-expense"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    await flush();
    expect(m.router.currentRoute.value.path).toContain('add-expense');
    expect(m.router.currentRoute.value.query['live']).toBe('off');
    expect(amount().value).toBe('');
    m.unmount();
  });
});
