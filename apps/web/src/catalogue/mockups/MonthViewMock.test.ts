import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { added, resetMockExpenses } from './mockExpenses.js';
import { byLabel, flush, mountAt, setValue } from './testMount.js';

const T = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const tile = (el: Element, label: string) =>
  [...el.querySelectorAll('[data-tile]')]
    .find((t) => t.textContent?.includes(label))!
    .querySelector('[data-testid="tile-amount"]') as HTMLElement;
const rows = (el: Element) => [...el.querySelectorAll('[data-testid="entry-row"]')];
const bars = (el: Element) =>
  [...el.querySelectorAll('.mk-bar-fill')].map((r) => r.getAttribute('width'));
const money = (s: string) => Math.round(parseFloat(s.replace(/[£,−]/g, '')) * 100);

let mounted: Awaited<ReturnType<typeof mountAt>> | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  resetMockExpenses();
});
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});
const open = async (q = 'live=off') => (mounted = await mountAt(`/__ui/mockups/month-view?${q}`));

/** Open the sheet from the board, fill it and submit. Returns the dialog element. */
async function add(el: Element, amount: string, note = 'Mockup lunch') {
  T(el, 'add-expense').click();
  await vi.advanceTimersByTimeAsync(10);
  await flush();
  const dlg = document.querySelector('[role="dialog"]')!;
  setValue(byLabel(dlg, 'Amount') as HTMLInputElement, amount);
  setValue(byLabel(dlg, 'Category') as HTMLSelectElement, 'Groceries');
  setValue(byLabel(dlg, 'Note') as HTMLInputElement, note);
  dlg.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.advanceTimersByTimeAsync(10);
  await flush();
  return dlg;
}

describe('month switcher', () => {
  it('changes the label, entries, tiles and bars', async () => {
    const { el } = await open();
    const label = T(el, 'month-label').textContent;
    const before = {
      rows: rows(el).map((r) => r.textContent),
      spent: tile(el, 'Spent').textContent,
      left: tile(el, 'Left').textContent,
      bars: bars(el),
    };
    T(el, 'month-prev').click();
    await flush();
    expect(T(el, 'month-label').textContent).not.toBe(label);
    expect(rows(el).map((r) => r.textContent)).not.toEqual(before.rows);
    expect(tile(el, 'Spent').textContent).not.toBe(before.spent);
    expect(tile(el, 'Left').textContent).not.toBe(before.left);
    expect(bars(el)).not.toEqual(before.bars);
    T(el, 'month-next').click();
    await flush();
    expect(T(el, 'month-label').textContent).toBe(label);
  });

  it('adds mk-growing only during a month change, not on first render or a live refresh', async () => {
    const { el } = await open('');
    const root = () => el.querySelector('[data-mockup="month-view"]')!;
    expect(root().classList.contains('mk-growing')).toBe(false);
    await vi.advanceTimersByTimeAsync(1300); // the rate arrives: a live refresh
    expect(root().classList.contains('mk-growing')).toBe(false);
    T(el, 'month-prev').click();
    await flush();
    expect(root().classList.contains('mk-growing')).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(root().classList.contains('mk-growing')).toBe(false);
  });
});

describe('add and remove', () => {
  it('adds a row, Spent +12.50, Left -12.50, and the figure flips once', async () => {
    const { el } = await open();
    const n = rows(el).length;
    const spent = money(tile(el, 'Spent').textContent!);
    const left = money(tile(el, 'Left').textContent!);
    expect(tile(el, 'Spent').classList.contains('mk-flip')).toBe(false);
    await add(el, '12.50');
    expect(rows(el)).toHaveLength(n + 1);
    expect(money(tile(el, 'Spent').textContent!) - spent).toBe(1250);
    expect(left - money(tile(el, 'Left').textContent!)).toBe(1250);
    expect(tile(el, 'Spent').classList.contains('mk-flip')).toBe(true);
    expect(el.querySelectorAll('[data-tile-primary="figure"]')).toHaveLength(1);
  });

  it('remove restores the tiles, undo restores the row', async () => {
    const { el } = await open();
    const n = rows(el).length;
    const spent = tile(el, 'Spent').textContent;
    await add(el, '12.50');
    (el.querySelector('[aria-label="Remove Mockup lunch"]') as HTMLElement).click();
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(rows(el)).toHaveLength(n);
    expect(tile(el, 'Spent').textContent).toBe(spent);
    T(el, 'undo-remove').click();
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(rows(el)).toHaveLength(n + 1);
  });

  it('rejects 12.345 and an empty amount with a message, and keeps the sheet open', async () => {
    const { el } = await open();
    let dlg = await add(el, '12.345');
    expect(dlg.textContent).toMatch(/two decimal places/i);
    setValue(byLabel(dlg, 'Amount') as HTMLInputElement, '');
    dlg.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    dlg = document.querySelector('[role="dialog"]')!;
    expect(dlg.textContent).toMatch(/enter an amount/i);
    expect(added.value).toHaveLength(0); // nothing added
  });
});

describe('live rate', () => {
  const fig = (el: Element) => el.querySelector('[data-live="rate"]')!.textContent;
  it('arrives after about 1.2 s', async () => {
    const { el } = await open('');
    expect(fig(el)).toMatch(/US\$/);
    await vi.advanceTimersByTimeAsync(1300);
    expect(fig(el)).toMatch(/£/);
  });
  it('?state=rate-arrives still works', async () => {
    const { el } = await open('state=rate-arrives');
    await vi.advanceTimersByTimeAsync(1300);
    expect(fig(el)).toMatch(/£/);
  });
  it('live=off stays pending', async () => {
    const { el } = await open('live=off');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fig(el)).toMatch(/US\$/);
  });
});

describe('edge fixture', () => {
  it('keeps the layout contract after an interaction', async () => {
    const { el } = await open('live=off&fixture=edge');
    const n = rows(el).length;
    T(el, 'entry-remove').click();
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(rows(el)).toHaveLength(n - 1);
    expect(tile(el, 'Spent').textContent).toContain('£');
    expect(el.querySelectorAll('[data-tile-primary="figure"]')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="entry-amount"]')).toHaveLength(n - 1);
  });
});
