import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { months } from '../fixtures-months.js';
import { resetMockExpenses } from './mockExpenses.js';
import { contrastRatio } from '@desk/ui';
import { flush, mountAt, setValue } from './testMount.js';

const T = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const tile = (el: Element, id: string) =>
  el.querySelector(`[data-g-tile="${id}"] [data-g-figure]`) as HTMLElement;
const money = (s: string) => Math.round(parseFloat(s.replace(/[£,]/g, '').replace('−', '-')) * 100);

let mounted: Awaited<ReturnType<typeof mountAt>> | undefined;
beforeEach(() => resetMockExpenses());
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.replaceChildren();
});
const open = async () => (mounted = await mountAt('/__ui/mockups/glassy-month'));

describe('glassy month mock-up (direction round for ADR-0008)', () => {
  it('greets, and the bento figures add up: left = budget − spent', async () => {
    const { el } = await open();
    const sep = months[1]!;
    const spent = sep.entries.reduce((s, e) => s + e.amount, 0);
    expect(el.querySelector('h1')!.textContent).toContain('Good morning');
    expect(money(tile(el, 'spent').textContent!)).toBe(spent);
    expect(money(tile(el, 'left').textContent!)).toBe(sep.budget - spent);
    expect(el.querySelectorAll('[data-g-tile]')).toHaveLength(5);
  });

  it('floating nav has at most five items, each with a visible label, one current', async () => {
    const { el } = await open();
    const items = [...T(el, 'g-nav').querySelectorAll('a, button')];
    expect(items.length).toBeLessThanOrEqual(5);
    for (const i of items)
      expect(i.querySelector('.g-nav-label')!.textContent!.trim()).not.toBe('');
    expect(items.filter((i) => i.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('month chart draws one bar per month and offers the same data as a table', async () => {
    const { el } = await open();
    expect(el.querySelectorAll('.g-chart-bar')).toHaveLength(months.length);
    const tab = [...el.querySelectorAll('[role="tab"]')].find((t) =>
      t.textContent?.includes('Table'),
    );
    (tab as HTMLElement).click();
    await flush();
    expect(el.querySelectorAll('[data-testid="g-chart-table"] tbody tr')).toHaveLength(
      months.length,
    );
  });

  it('takes any colour for the accent, backdrop and selected nav item, and keeps text readable', async () => {
    const { el } = await open();
    const root = el.querySelector('.g-root') as HTMLElement;
    const v = (name: string) => root.style.getPropertyValue(name);
    const warm = v('--g-s1');
    setValue(T(el, 'g-accent') as HTMLInputElement, '#ffff00');
    setValue(T(el, 'g-tint') as HTMLInputElement, '#0000ff');
    setValue(T(el, 'g-nav-colour') as HTMLInputElement, '#ff00ff');
    await flush();
    expect(v('--color-accent')).not.toBe('#ffff00'); // nudged: yellow bars vanish on light glass
    expect(contrastRatio(v('--color-accent'), v('--color-accent-fg'))).toBeGreaterThanOrEqual(4.5);
    expect(v('--g-s1')).not.toBe(warm);
    expect(v('--g-nav-bg')).toBe('#ff00ff');
    expect(contrastRatio(v('--g-nav-bg'), v('--g-nav-fg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the owner layout: filled hero, Add beside the greeting, an over-budget banner', async () => {
    const { el } = await open();
    const overs = months[1]!.categories.filter((c) => c.spent > c.limit).length;
    expect(el.querySelector('[data-g-tile="left"]')!.classList.contains('accent')).toBe(true);
    expect(el.querySelectorAll('.accent')).toHaveLength(1);
    expect(T(el, 'add-expense').closest('nav')).toBeNull();
    expect(T(el, 'add-expense').closest('.g-hello')).not.toBeNull();
    expect(T(el, 'g-over-banner').textContent).toContain(`${overs} categor`);
  });

  it('the month switcher changes the label and the figures', async () => {
    const { el } = await open();
    const before = [T(el, 'month-label').textContent, tile(el, 'spent').textContent];
    T(el, 'month-prev').click();
    await flush();
    expect(T(el, 'month-label').textContent).not.toBe(before[0]);
    expect(tile(el, 'spent').textContent).not.toBe(before[1]);
  });
});
