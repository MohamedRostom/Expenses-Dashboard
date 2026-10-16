import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockExpenses } from './mockExpenses.js';
import { flush, mountAt } from './testMount.js';

describe('settings mock', () => {
  beforeEach(resetMockExpenses);
  afterEach(() => document.body.replaceChildren());

  it('switches month and theme, and adds no controls', async () => {
    const m = await mountAt('/__ui/mockups/settings?live=off');
    const label = m.el.querySelector('[data-testid="month-label"]')!;
    const before = label.textContent;
    (m.el.querySelector('[data-testid="month-next"]') as HTMLElement).click();
    await flush();
    expect(label.textContent).not.toBe(before);

    const radios = [...m.el.querySelectorAll('[data-testid="theme-toggle"] [role="radio"]')];
    (radios.find((r) => r.textContent?.trim() === 'Dark') as HTMLElement).click();
    expect(m.el.querySelector('[data-mockup-root]')!.getAttribute('data-theme')).toBe('dark');
    expect(m.el.querySelectorAll('[data-testid="add-expense"]')).toHaveLength(1);
    expect(m.el.querySelectorAll('[data-testid="theme-toggle"]')).toHaveLength(1);
    m.unmount();
  });
});
