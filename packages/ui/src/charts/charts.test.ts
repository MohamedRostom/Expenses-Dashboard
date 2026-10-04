// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (n: string) => readFileSync(join(process.cwd(), 'src/charts', `${n}.vue`), 'utf-8');
const style = (s: string) => s.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]!;
const rule = (css: string, sel: string) =>
  css.match(new RegExp(String.raw`\.${sel}\s*\{([^}]*)\}`))?.[1] ?? '';

describe.each(['CategoryBars', 'TrendSparkline', 'YearBars'])('%s consumes tokens', (name) => {
  const s = src(name);
  it('has no colour literal in template or style', () => {
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
  });
  it('gaps equal to a space token use the token (0.4rem has none, kept as is)', () => {
    expect(style(s)).not.toMatch(/\bgap\s*:\s*(0?\.25|0?\.5|0?\.75|1)rem/);
  });
});

describe('series and over-budget colours', () => {
  it('CategoryBars: fill is accent, over-budget is critical, tick is a token', () => {
    const css = style(src('CategoryBars'));
    expect(rule(css, 'desk-category-bars-fill')).toContain('var(--color-accent)');
    expect(rule(css, 'desk-category-bars-fill-critical')).toContain('var(--color-critical)');
    expect(rule(css, 'desk-category-bars-tick')).toMatch(/stroke:\s*var\(--color-/);
  });
  it('YearBars: fill is accent, over-budget is critical', () => {
    const css = style(src('YearBars'));
    expect(rule(css, 'desk-year-bars-fill')).toContain('var(--color-accent)');
    expect(rule(css, 'desk-year-bars-fill-critical')).toContain('var(--color-critical)');
  });
  it('TrendSparkline: line is accent', () => {
    expect(rule(style(src('TrendSparkline')), 'desk-trend-sparkline-line')).toContain(
      'var(--color-accent)',
    );
  });
  it('status colours are never series', () => {
    for (const n of ['CategoryBars', 'TrendSparkline', 'YearBars'])
      expect(style(src(n))).not.toMatch(/(fill|stroke):\s*var\(--color-warn\)/);
  });
});

describe('table fallback', () => {
  it('YearBars keeps its data table', () => {
    expect(src('YearBars')).toMatch(/<table class="desk-year-bars-table">/);
  });
});
