// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import YearBars from './YearBars.vue';

async function mount() {
  const el = document.createElement('div');
  const months = [
    { month: '2026-01', spent: 123456, budgeted: 0 },
    { month: '2026-02', spent: 0, budgeted: 0 },
  ];
  createApp({ render: () => h(YearBars, { months, currency: 'GBP' }) }).mount(el);
  await nextTick();
  return el;
}

describe('YearBars value labels', () => {
  it('prints a compact figure above non-zero bars only, hidden from assistive tech', async () => {
    const el = await mount();
    const cols = el.querySelectorAll('.desk-year-bars-col');
    const jan = cols[0]!.querySelector('.desk-year-bars-value')!;
    expect(jan.textContent!.trim()).toBe('1.2K');
    expect(jan.getAttribute('aria-hidden')).toBe('true');
    // The bar's own label still carries the full value.
    expect(cols[0]!.getAttribute('aria-label')).toContain('1234.56 GBP');
    expect(cols[1]!.querySelector('.desk-year-bars-value')).toBeNull();
  });

  it('uses one compact format (one fraction digit at most) for every label', async () => {
    const el = document.createElement('div');
    const minors = [123456, 1234567, 12345];
    const months = minors.map((spent, i) => ({ month: `2026-0${i + 1}`, spent, budgeted: 0 }));
    createApp({ render: () => h(YearBars, { months, currency: 'GBP' }) }).mount(el);
    await nextTick();
    const fmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    const v = [...el.querySelectorAll('.desk-year-bars-value')].map((n) => n.textContent!.trim());
    expect(v).toEqual(minors.map((m) => fmt.format(m / 100)));
  });

  it('hides the labels below 768px (the table carries the values); no vertical text', () => {
    const src = readFileSync('src/charts/YearBars.vue', 'utf8');
    const phone = src.slice(
      src.indexOf('@media (max-width: 767px)'),
      src.indexOf('.desk-year-bars-caption'),
    );
    expect(phone).toMatch(/\.desk-year-bars-value,[^{]*\{[^}]*display: none/);
    expect(src).not.toContain('writing-mode');
  });

  it('prints the table month through the caller formatter, and the raw month without one', async () => {
    const el = document.createElement('div');
    const months = [{ month: '2026-01', spent: 100, budgeted: 0 }];
    createApp({
      render: () => h(YearBars, { months, currency: 'GBP', formatMonth: () => 'Jan 2026' }),
    }).mount(el);
    await nextTick();
    expect(el.querySelector('tbody th')!.textContent).toBe('Jan 2026');
    const plain = await mount();
    expect(plain.querySelector('tbody th')!.textContent).toBe('2026-01');
  });

  it('uses type tokens, not rem literals', () => {
    const src = readFileSync('src/charts/YearBars.vue', 'utf8');
    expect(src).not.toMatch(/font-size:\s*[\d.]+rem/);
    expect(src).toMatch(/\.desk-year-bars-value[^{]*\{[^}]*font-variant-numeric:\s*tabular-nums/);
  });
});
