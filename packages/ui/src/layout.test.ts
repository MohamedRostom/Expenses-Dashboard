import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'layout.css'), 'utf-8');
const i = css.indexOf('.board-grid {');

describe('.board-grid (T023, research R7)', () => {
  it('exists', () => expect(i).toBeGreaterThanOrEqual(0));
  const rule = i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  it('reflows by width with no breakpoint: 1 column at 360, 2 at 768, full grid on desktop', () => {
    expect(rule).toContain('display: grid');
    expect(rule).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    );
    expect(css).not.toContain('@media');
  });
  it('is never wider than 1160px and cannot be blown out by its children', () => {
    expect(rule).toContain('max-width: 1160px');
    expect(css).toMatch(/\.board-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  });
});

// Chrome and Edge on Windows paint a <select>'s open list from the select's own background, so a
// transparent select gets a white list even with color-scheme: dark. Options carry the theme.
describe('native option lists', () => {
  it('take the surface and text colours of the current theme', () => {
    const at = css.indexOf('option {');
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('background-color: var(--color-surface)');
    expect(rule).toContain('color: var(--color-fg)');
  });
});
