import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compositeOver, contrastRatio } from './contrast.js';
import {
  GLASS,
  GROUND_CAP,
  GROUND_TINT,
  SOLID,
  backdropStops,
  glassOver,
  safeAccent,
} from './glassyColours.js';

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
    glass: [GLASS.light.rgb, GLASS.light.alpha],
    blueC: '#8fb3ff',
    amberC: '#f5c27a',
    ...alphas(LIGHT),
  },
  dark: {
    block: DARK,
    glass: [GLASS.dark.rgb, GLASS.dark.alpha],
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
    const dark = theme === 'dark';
    // Presets draw above the warm ground now (ADR-0008): test them over the plain background and over
    // the worst warm stop (black tint in light, white in dark).
    const worstWarm = backdropStops(dark ? '#ffffff' : '#000000', dark)[0]!;
    const plain = token(t.block, '--color-bg');
    const raised = token(t.block, '--color-surface-raised');
    const ink = token(t.block, '--color-fg');
    // Worst-case backdrop per preset: the tint (and companions) at max alpha over the ground.
    const backdrops = (tint: string, ground: string): Record<string, string> => {
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
    for (const [groundName, ground] of [
      ['plain', plain],
      ['warm', worstWarm],
    ] as const) {
      for (const tint of SWATCHES) {
        for (const [preset, backdrop] of Object.entries(backdrops(tint, ground))) {
          for (const panel of ['glass', 'opaque'] as const) {
            const surface =
              panel === 'opaque' ? raised : compositeOver(t.glass[0], t.glass[1], backdrop);
            it.each(TEXT)(
              `${theme} ${groundName} ${preset} ${tint} ${panel}: %s >= 4.5:1`,
              (name) => {
                expect(contrastRatio(token(t.block, name), surface)).toBeGreaterThanOrEqual(4.5);
              },
            );
          }
        }
      }
    }
  }
});

// ADR-0008: the warm ground is always drawn, so it is the backdrop under every panel. The real stops
// (backdropStops), the worst-case tints (black and white) and the default sienna, both themes, glass
// and solid panels, normal and strong glass.
describe('ADR-0008 warm ground contrast matrix', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    const dark = theme === 'dark';
    const raised = token(t.block, '--color-surface-raised');
    for (const tint of ['#000000', '#ffffff', GROUND_TINT]) {
      const stops = backdropStops(tint, dark);
      for (const [i, stop] of stops.entries()) {
        const panels: [string, string][] = [
          ['glass', glassOver(stop, dark)],
          ['glass-strong', glassOver(stop, dark, true)],
          ['solid', raised],
        ];
        for (const [kind, surface] of panels) {
          it.each(TEXT)(`${theme} ${tint} stop ${i} ${kind}: %s >= 4.5:1`, (name) => {
            expect(contrastRatio(token(t.block, name), surface)).toBeGreaterThanOrEqual(4.5);
          });
          it(`${theme} ${tint} stop ${i} ${kind}: an accent bar via safeAccent >= 3:1`, () => {
            for (const picked of ['#0e3d2a', '#2c7452', '#ffff00', '#ff0000', '#808080']) {
              expect(contrastRatio(safeAccent(picked, dark, tint), surface)).toBeGreaterThanOrEqual(
                3,
              );
            }
          });
        }
        it(`${theme} ${tint} stop ${i}: body text on the bare ground >= 4.5:1`, () => {
          expect(contrastRatio(token(t.block, '--color-fg'), stop)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
  it('keeps the tint caps, glass numbers and solid fallback in step with tokens.css', () => {
    expect(num(LIGHT, '--ground-cap')).toBe(GROUND_CAP.light * 100);
    expect(num(DARK, '--ground-cap')).toBe(GROUND_CAP.dark * 100);
    const glass = (block: string, name: string) =>
      css
        .slice(css.indexOf('{', css.indexOf(block)))
        .match(new RegExp(String.raw`${name}:\s*rgb\((\d+) (\d+) (\d+) / ([0-9.]+)\)`))!;
    for (const [block, g] of [
      [LIGHT, GLASS.light],
      [DARK, GLASS.dark],
    ] as const) {
      const hex = (m: RegExpMatchArray) =>
        '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
      expect(hex(glass(block, '--color-surface-glass'))).toBe(g.rgb);
      expect(Number(glass(block, '--color-surface-glass')[4])).toBe(g.alpha);
      expect(Number(glass(block, '--color-surface-glass-strong')[4])).toBe(g.strong);
    }
    expect(token(LIGHT, '--color-surface-raised')).toBe(SOLID.light);
    expect(token(DARK, '--color-surface-raised')).toBe(SOLID.dark);
  });
});

// Converted-currency rows (spec 005): --color-row-converted is one fixed steel-blue hue at a low alpha over
// the glass. It does not follow the user's accent or ground, so only the ground stops vary here; fg and
// muted text must hold on the tint in both themes.
describe('converted row tint contrast', () => {
  const HUE = '#6f8fb3';
  const pct = (block: string) => {
    const open = css.indexOf('{', css.indexOf(block));
    const m = css
      .slice(open, css.indexOf('}', open))
      .match(
        /--color-row-converted:\s*color-mix\(in srgb, var\(--color-converted-hue\) (\d+)%, transparent\)/,
      );
    if (!m) throw new Error(`--color-row-converted not found in ${block}`);
    return Number(m[1]) / 100;
  };
  it('is defined in the bare, system-dark and explicit-dark blocks', () => {
    expect(css.match(/--color-row-converted:/g)).toHaveLength(3);
  });
  it('uses one fixed hue, defined once, never the accent', () => {
    expect(css.match(/--color-converted-hue:/g)).toHaveLength(1);
    expect(css).toContain(`--color-converted-hue: ${HUE};`);
    expect(css).not.toMatch(/--color-row-converted:[^;]*--color-accent/);
  });
  for (const [theme, t] of Object.entries(THEMES)) {
    const dark = theme === 'dark';
    for (const tint of ['#000000', '#ffffff', GROUND_TINT]) {
      for (const [i, stop] of backdropStops(tint, dark).entries()) {
        it(`${theme} ground ${tint} stop ${i}: fg and muted >= 4.5:1 on the tint`, () => {
          const surface = compositeOver(HUE, pct(t.block), glassOver(stop, dark));
          for (const name of ['--color-fg', '--color-fg-muted'])
            expect(contrastRatio(token(t.block, name), surface)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
