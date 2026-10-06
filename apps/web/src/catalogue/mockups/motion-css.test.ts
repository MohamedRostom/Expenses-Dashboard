// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
const files = { 'motion.css': read('motion.css'), 'board.css': read('board.css') };

describe('mock-up motion CSS', () => {
  for (const [name, css] of Object.entries(files)) {
    it(`${name}: every transition and animation duration is a --motion-* token`, () => {
      // a declaration with a literal time (1.2s, 200ms) and no --motion-* token
      const bad = [...css.matchAll(/\b(?:transition|animation)(?:-duration)?\s*:([^;]+);/g)]
        .map((m) => m[1]!.trim())
        .filter((v) => !/^(none|0ms)$/.test(v) && !/var\(--motion-/.test(v));
      expect(bad).toEqual([]);
    });
    it(`${name}: no literal duration above 280ms`, () => {
      const lits = [...css.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map(
        (m) => parseFloat(m[1]!) * (m[2] === 's' ? 1000 : 1),
      );
      expect(lits.filter((ms) => ms > 280)).toEqual([]);
    });
  }

  it('motion.css zeroes durations under prefers-reduced-motion', () => {
    const block = files['motion.css'].match(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*$/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/animation(-duration)?\s*:\s*(none|0ms)/);
    expect(block).toMatch(/transition(-duration)?\s*:\s*(none|0ms)/);
  });

  it('only the skeleton pulse loops', () => {
    const all = files['motion.css'] + files['board.css'];
    const loops = [...all.matchAll(/[^{}]*\{[^{}]*\binfinite\b[^{}]*\}/g)].map((m) => m[0]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toContain('mk-pulse');
  });

  it('tile, panel and widget wrappers are inline-size containers with @container rules', () => {
    const css = files['board.css'] + files['motion.css'];
    for (const cls of ['mk-tile', 'mk-panel', 'mk-widget']) {
      expect(css, cls).toMatch(
        new RegExp(`\\.${cls}\\s*\\{[^}]*container-type\\s*:\\s*inline-size`),
      );
    }
    expect(css).toMatch(/@container\s/);
  });
});
