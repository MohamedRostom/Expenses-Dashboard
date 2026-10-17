import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'surface.css'), 'utf-8');
const blockOf = (selector: string) => {
  const i = css.indexOf(selector);
  expect(i, `${selector} present`).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
};

describe('.surface (T012, DESIGN.md Glass)', () => {
  const base = blockOf('.surface {');
  it('is glass: glass fill, hairline, blur (both prefixes), xl radius, raised shadow', () => {
    expect(base).toContain('var(--color-surface-glass)');
    expect(base).toContain('var(--color-glass-line)');
    expect(base).toContain('backdrop-filter: blur(var(--blur-surface)) saturate(140%)');
    expect(base).toContain('-webkit-backdrop-filter: blur(var(--blur-surface)) saturate(140%)');
    expect(base).toContain('var(--radius-xl)');
    expect(base).toContain('var(--shadow-raised)');
  });
  it.each([
    '@supports not (backdrop-filter: blur(1px))',
    ":root[data-panels='solid'] .surface",
    '@media (forced-colors: active)',
    '@media (prefers-reduced-transparency: reduce)',
  ])('falls back to opaque raised with no blur under %s', (sel) => {
    const i = css.indexOf(sel);
    expect(i).toBeGreaterThanOrEqual(0);
    const rule = css.slice(i, css.indexOf('}', css.indexOf('}', i) + 1) + 1);
    expect(rule).toContain('var(--color-surface-raised)');
    expect(rule).toContain('backdrop-filter: none');
    expect(rule).toContain('-webkit-backdrop-filter: none');
  });
});
