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
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector!.replace(/\s+/g, ' ').trim(),
  tokens: new Map(
    [...body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  ) as Tokens,
}));
function rule(selector: string): Tokens {
  const found = rules.find((r) => r.selector === selector);
  if (!found) throw new Error(`no rule "${selector}" in tokens.css`);
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

describe('contrast pairs (WCAG 2.2 AA)', () => {
  // The contract also lists --color-focus on --color-accent at 3:1, but that is unreachable with the
  // current accents (bg:accent is ~5.5:1 light and ~8:1 dark; one colour would need >= 9:1 between
  // them). Left out until T028 sets the values; flagged in the T011 hand-off.
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
  const themes: [string, Tokens][] = [
    ['light', light],
    ['system dark', systemDark],
    ['explicit dark', explicitDark],
  ];
  for (const [theme, tokens] of themes) {
    it.each(pairs)(`${theme}: %s on %s >= %f`, (fg, bg, min) => {
      const ratio = contrastRatio(
        resolve(tokens, `--color-${fg}`),
        resolve(tokens, `--color-${bg}`),
      );
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }
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
