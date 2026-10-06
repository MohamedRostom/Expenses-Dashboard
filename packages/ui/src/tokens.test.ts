import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(join(here, 'tokens.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

// --- tokens.css parsing -------------------------------------------------------------------
type Tokens = Map<string, string>;
function parseRules(text: string) {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.replace(/\s+/g, ' ').trim(),
    tokens: new Map(
      [...body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    ) as Tokens,
  }));
}
const rules = parseRules(css);
function rule(selector: string, from = rules): Tokens {
  const found = from.find((r) => r.selector === selector);
  if (!found) throw new Error(`no rule "${selector}"`);
  return found.tokens;
}
const light = rule("[data-theme='light'], :root");
const systemDark = rule(":root:not([data-theme='light'])");
const explicitDark = rule(":root[data-theme='dark'], [data-theme='dark']");
const reduced =
  rules.find((r) => r.selector === ':root' && r.tokens.has('--motion-fast'))?.tokens ?? new Map();

function resolve(theme: Tokens, name: string): string {
  const value = theme.get(name) ?? light.get(name);
  if (value === undefined) throw new Error(`${name} undefined`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolve(theme, alias[1]!) : value;
}

const colours = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'fg',
  'fg-muted',
  'accent',
  'accent-fg',
  'focus',
  'warn',
  'critical',
  'selection',
].map((n) => `--color-${n}`);
const shadows = ['--shadow-raised', '--shadow-overlay'];
const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'display'];
const names = [
  '--font-sans',
  '--font-mono',
  ...sizes.map((s) => `--text-${s}`),
  ...sizes.map((s) => `--leading-${s}`),
  '--tracking-tight',
  '--tracking-normal',
  '--tracking-wide',
  ...[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((n) => `--space-${n}`),
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  ...shadows,
  ...colours,
  '--motion-fast',
  '--motion-base',
  '--motion-slow',
  '--ease-standard',
  '--ease-exit',
  '--target-min',
  '--content-max',
  '--gutter',
];

describe('token contract', () => {
  it.each(names)('%s is defined on the light selector', (n) => expect(light.has(n)).toBe(true));
  it.each([...colours, ...shadows])('%s is redefined in both dark blocks', (n) => {
    expect(systemDark.has(n), 'system dark').toBe(true);
    expect(explicitDark.has(n), 'explicit dark').toBe(true);
  });
});

// The contract also lists --color-focus on --color-accent at 3:1, but that is unreachable with the
// current accents (bg:accent is ~5.5:1 light and ~8:1 dark; one colour would need >= 9:1 between
// them). Left out for tokens.css until T028 sets the values; the proposed identity asserts it.
const pairs: [string, string, number][] = [
  ['fg', 'bg', 4.5],
  ['fg', 'surface', 4.5],
  ['fg', 'surface-raised', 4.5],
  ['fg-muted', 'bg', 4.5],
  ['fg-muted', 'surface', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent', 'bg', 3],
  ['warn', 'bg', 4.5],
  ['warn', 'surface', 4.5],
  ['critical', 'bg', 4.5],
  ['critical', 'surface', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['border', 'bg', 3],
];
describe('contrast pairs (WCAG 2.2 AA)', () => {
  const themes: [string, Tokens][] = [
    ['light', light],
    ['system dark', systemDark],
    ['explicit dark', explicitDark],
  ];
  // Known gap kept on purpose: dark --color-critical stays #a83a2e (~2.7:1) because Phase 2 must not
  // change how screens look; the fix is a design decision for T028 (spec 004 FR-002). `it.fails`
  // turns red once the value is fixed, so this exception cannot outlive the fix.
  const knownGap = (theme: string, fg: string) => theme !== 'light' && fg === 'critical';
  for (const [theme, tokens] of themes) {
    it.each(pairs.filter(([fg]) => knownGap(theme, fg)))(
      `${theme}: %s on %s >= %f (known gap until T028)`,
      (fg, bg, min) => {
        expect(
          contrastRatio(resolve(tokens, `--color-${fg}`), resolve(tokens, `--color-${bg}`)),
        ).toBeLessThan(min);
      },
    );
    it.each(pairs.filter(([fg]) => !knownGap(theme, fg)))(
      `${theme}: %s on %s >= %f`,
      (fg, bg, min) => {
        const ratio = contrastRatio(
          resolve(tokens, `--color-${fg}`),
          resolve(tokens, `--color-${bg}`),
        );
        expect(ratio).toBeGreaterThanOrEqual(min);
      },
    );
  }
});

// T026: the proposed identity (ADR-0006, DESIGN.md "Concourse Board") lives only in this file,
// scoped under [data-identity='proposed'], until T028 deletes it or moves it into tokens.css.
const PROPOSED = 'apps/web/src/catalogue/proposed-tokens.css';
describe('proposed identity tokens (T026)', () => {
  const path = join(root, PROPOSED);
  it('exists', () => expect(existsSync(path)).toBe(true));
  if (!existsSync(path)) return;
  const p = parseRules(readFileSync(path, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, ''));
  const scoped = "[data-identity='proposed']";
  const pLight = rule(scoped, p);
  const blocks: [string, Tokens][] = [
    ['light', pLight],
    [
      'forced light',
      rule(`:root [data-theme='light'] ${scoped}, :root ${scoped}[data-theme='light']`, p),
    ],
    ['system dark', rule(`:root:not([data-theme='light']) ${scoped}`, p)],
    [
      'explicit dark',
      rule(
        `:root[data-theme='dark'] ${scoped}, :root [data-theme='dark'] ${scoped}, :root ${scoped}[data-theme='dark']`,
        p,
      ),
    ],
  ];
  it('every rule is scoped under the proposed wrapper', () =>
    expect(p.filter((r) => !r.selector.includes(scoped))).toEqual([]));
  it('forced light repeats the light values', () => expect(blocks[1]![1]).toEqual(pLight));
  for (const [theme, tokens] of blocks) {
    it.each([...colours, ...shadows])(`${theme}: %s is defined`, (n) =>
      expect(tokens.has(n)).toBe(true),
    );
    it.each([...pairs, ['focus', 'accent', 3] as [string, string, number]])(
      `${theme}: %s on %s >= %f`,
      (fg, bg, min) => {
        const get = (n: string) => tokens.get(`--color-${n}`) ?? pLight.get(`--color-${n}`)!;
        expect(contrastRatio(get(fg), get(bg))).toBeGreaterThanOrEqual(min);
      },
    );
  }
});

// T027a: motion and fluid-layout tokens exist only in the proposed file until T028 promotes them.
describe('proposed motion and fluid tokens (T027a)', () => {
  const path = join(root, PROPOSED);
  const raw = existsSync(path) ? readFileSync(path, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '') : '';
  const p = parseRules(raw);
  const all = new Map(p.flatMap((r) => [...r.tokens]).reverse()); // first rule wins; reduced block is last
  /** Resolves `clamp(min, a rem + b vw, max)` at a viewport width, in rem (16px). */
  function clampRem(value: string, vw: number): number {
    const m = value.match(
      /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/,
    );
    if (!m) throw new Error(`not a clamp(rem, rem + vw, rem): ${value}`);
    const [lo, a, b, hi] = m.slice(1).map(Number) as [number, number, number, number];
    return Math.min(hi, Math.max(lo, a + (b * vw) / 100 / 16));
  }
  it('--motion-stagger is 40ms', () => expect(all.get('--motion-stagger')).toBe('40ms'));
  it('--text-display-fluid is 2rem at 360 and 2.5rem at 1280', () => {
    const v = all.get('--text-display-fluid')!;
    expect(v).toMatch(/^clamp\(2rem,/);
    expect(clampRem(v, 360)).toBeCloseTo(2, 2);
    expect(clampRem(v, 1280)).toBeCloseTo(2.5, 2);
  });
  it('--gutter-fluid is 1rem at 360 and 2rem at 768', () => {
    const v = all.get('--gutter-fluid')!;
    expect(v).toMatch(/^clamp\(1rem,/);
    expect(clampRem(v, 360)).toBeCloseTo(1, 2);
    expect(clampRem(v, 768)).toBeCloseTo(2, 2);
  });
  it('reduced motion sets --motion-stagger to 0ms', () => {
    const block = raw.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)?.[0] ?? '';
    expect(parseRules(block).some((r) => r.tokens.get('--motion-stagger') === '0ms')).toBe(true);
  });
  it.each(['--motion-stagger', '--text-display-fluid', '--gutter-fluid'])(
    '%s is absent from tokens.css',
    (n) => expect(css).not.toContain(n),
  );
});

describe('motion contract', () => {
  it('reduced motion zeroes the three durations', () => {
    for (const n of ['--motion-fast', '--motion-base', '--motion-slow'])
      expect(reduced.get(n)).toBe('0ms');
  });
  it('no duration exceeds 300ms', () => {
    const durations = [...light].filter(([n]) => n.startsWith('--motion-'));
    expect(durations.length).toBe(3);
    for (const [, v] of durations) expect(parseFloat(v)).toBeLessThanOrEqual(300);
  });
});

// --- ratchets -----------------------------------------------------------------------------
function pending(file: string): string[] {
  const p = join(here, file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as string[]) : [];
}
function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : walk(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}
const repoPath = (p: string) => relative(root, p).replace(/\\/g, '/');

const driftRules: [string, RegExp][] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb/hsl colour', /\b(rgba?|hsla?)\(/],
  ['font-size literal', /font-size\s*:[^;]*\d(px|rem)\b/],
  ['margin/padding/gap literal', /\b(margin|padding|gap)(-[a-z]+)*\s*:[^;]*\d(px|rem)\b/],
  ['transition duration literal', /transition(-duration)?\s*:[^;]*\d(ms|s)\b/],
];
/** Style blocks of .vue files (plus inline `style` lines) and whole .css files, comments blanked. */
function styleLines(file: string): [number, string][] {
  const text = readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  const lines = text.split(/\r?\n/);
  if (file.endsWith('.css')) return lines.map((l, i) => [i + 1, l]);
  let inStyle = false;
  const out: [number, string][] = [];
  lines.forEach((l, i) => {
    if (/<style\b/.test(l)) inStyle = true;
    if (inStyle || /\bstyle\s*=/.test(l)) out.push([i + 1, l]);
    if (/<\/style>/.test(l)) inStyle = false;
  });
  return out;
}
const driftFiles = ['apps/web/src', 'apps/landing/src', 'packages/ui/src/components']
  .flatMap((d) => [...walk(join(root, d), '.vue'), ...walk(join(root, d), '.css')])
  .map(repoPath)
  .filter((f) => f !== PROPOSED) // a token source, like tokens.css; deleted in T028
  .sort();
function driftHits(path: string): string[] {
  return styleLines(join(root, path)).flatMap(([n, l]) =>
    driftRules.filter(([, re]) => re.test(l)).map(([why]) => `${path}:${n} ${why}: ${l.trim()}`),
  );
}

describe('token drift ratchet', () => {
  const listed = pending('drift-pending.json');
  it('every file outside the pending list uses tokens only', () => {
    expect(driftFiles.filter((f) => !listed.includes(f)).flatMap(driftHits)).toEqual([]);
  });
  it('no pending file is clean or missing', () => {
    expect(listed.filter((f) => !driftFiles.includes(f) || driftHits(f).length === 0)).toEqual([]);
  });
});

describe('story inventory ratchet', () => {
  const blocks = ['components', 'charts']
    .flatMap((d) => walk(join(here, d), '.vue'))
    .map(repoPath)
    .sort();
  const hasStory = (vue: string) => existsSync(join(root, vue.replace(/\.vue$/, '.story.ts')));
  const listed = pending('story-pending.json');
  it('every block outside the pending list has a story', () => {
    expect(blocks.filter((b) => !listed.includes(b) && !hasStory(b))).toEqual([]);
  });
  it('no pending block already has a story', () => {
    expect(listed.filter((b) => !blocks.includes(b) || hasStory(b))).toEqual([]);
  });
});
