import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compositeOver, contrastRatio } from './contrast.js';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf-8');

function num(blockStart: string, name: string): number {
  const open = css.indexOf('{', css.indexOf(blockStart));
  const m = css.slice(open, css.indexOf('}', open)).match(new RegExp(`${name}:\\s*([0-9.]+);`));
  if (!m) throw new Error(`token ${name} not found in ${blockStart}`);
  return Number(m[1]);
}

function token(blockStart: string, name: string): string {
  const open = css.indexOf('{', css.indexOf(blockStart));
  const block = css.slice(open, css.indexOf('}', open));
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found in ${blockStart}`);
  return m[1]!;
}

// Glass comes from DESIGN.md; the motion alphas are read from tokens.css so the test gates the shipped values.
const alphas = (block: string) => ({
  tintA: num(block, '--motion-alpha-aurora'),
  blue: num(block, '--motion-alpha-aurora-blue'),
  amber: num(block, '--motion-alpha-aurora-amber'),
  grid: num(block, '--motion-alpha-grid'),
  particles: num(block, '--motion-alpha-particles'),
  grain: num(block, '--motion-alpha-grain'),
});
const LIGHT = "[data-theme='light'],";
const DARK = ":root[data-theme='dark'],";
const THEMES = {
  light: {
    block: LIGHT,
    glass: ['#ffffff', 0.68],
    blueC: '#8fb3ff',
    amberC: '#f5c27a',
    ...alphas(LIGHT),
  },
  dark: {
    block: DARK,
    glass: ['#151a21', 0.66],
    blueC: '#344eaa',
    amberC: '#8c601e',
    ...alphas(DARK),
  },
} as const;
const SWATCHES = [
  '#7fd1a8',
  '#8fb3ff',
  '#f5c27a',
  '#c9a7ff',
  '#ff9fb2',
  '#e9edf2',
  '#ffffff',
  '#000000',
];
// Particles are 1-2px dots: under the panel's blur(20px) the panel sees their area average, not the dot
// colour (and without backdrop-filter the panel is opaque). Coverage = sum of pi*r^2/tile^2 using the
// outer gradient radii in BackgroundMotion.vue: tile A 1.8px and 1.5px on 190px, tile B 1.6px on 120px at 0.6x.
const DOT_COVERAGE =
  (Math.PI * (1.8 ** 2 + 1.5 ** 2)) / 190 ** 2 + (0.6 * Math.PI * 1.6 ** 2) / 120 ** 2;
const TEXT = ['--color-fg', '--color-fg-muted', '--color-warn', '--color-critical'];

describe('compositeOver', () => {
  it('blends and clamps', () => {
    expect(compositeOver('#ffffff', 0.5, '#000000')).toBe('#808080');
    expect(compositeOver('#123456', 1, '#ffffff')).toBe('#123456');
    expect(compositeOver('#123456', 0, '#ffffff')).toBe('#ffffff');
  });
});

describe('SC-004 background layer contrast matrix', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    const ground = token(t.block, '--color-bg');
    const raised = token(t.block, '--color-surface-raised');
    const ink = token(t.block, '--color-fg');
    // Worst-case backdrop per preset: the tint (and companions) at max alpha over the ground.
    const backdrops = (tint: string): Record<string, string> => {
      const aurora = compositeOver(
        t.amberC,
        t.amber,
        compositeOver(t.blueC, t.blue, compositeOver(tint, t.tintA, ground)),
      );
      return {
        none: ground,
        aurora,
        grid: compositeOver(theme === 'light' ? ink : tint, t.grid, ground),
        particles: compositeOver(tint, t.particles * DOT_COVERAGE, ground),
        grain: compositeOver(tint, t.grain, ground),
      };
    };
    for (const tint of SWATCHES) {
      for (const [preset, backdrop] of Object.entries(backdrops(tint))) {
        for (const panel of ['glass', 'opaque'] as const) {
          const surface =
            panel === 'opaque' ? raised : compositeOver(t.glass[0], t.glass[1], backdrop);
          it.each(TEXT)(`${theme} ${preset} ${tint} ${panel}: %s >= 4.5:1`, (name) => {
            expect(contrastRatio(token(t.block, name), surface)).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
    }
  }
});
