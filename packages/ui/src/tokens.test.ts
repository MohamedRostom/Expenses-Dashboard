import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
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
  ['focus', 'accent', 3],
  ['border', 'bg', 3],
];
describe('contrast pairs (WCAG 2.2 AA)', () => {
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

// Values: DESIGN.md frontmatter, ADR-0006 (accepted 2026-10-10).
const LIGHT: Record<string, string> = {
  bg: '#e8eaeb',
  surface: '#f6f7f7',
  'surface-raised': '#ffffff',
  border: '#6a727a',
  fg: '#14171b',
  'fg-muted': '#4b535b',
  accent: '#0e3d2a',
  'accent-fg': '#f6f7f7',
  focus: '#4d80da',
  warn: '#8a5a00',
  critical: '#b00020',
  selection: '#d8e6de',
};
const DARK: Record<string, string> = {
  bg: '#0e1114',
  surface: '#171b20',
  'surface-raised': '#1f242a',
  border: '#5d656e',
  fg: '#f2f2ee',
  'fg-muted': '#a7adb3',
  accent: '#2c7452',
  'accent-fg': '#f2f2ee',
  focus: '#a6caff',
  warn: '#ffb000',
  critical: '#ff6b6b',
  selection: '#20332b',
};
describe('Concourse Board identity values (ADR-0006)', () => {
  it.each(Object.entries(LIGHT))('light --color-%s is %s', (n, v) =>
    expect(light.get(`--color-${n}`)).toBe(v),
  );
  for (const [theme, tokens] of [
    ['system dark', systemDark],
    ['explicit dark', explicitDark],
  ] as const)
    it.each(Object.entries(DARK))(`${theme} --color-%s is %s`, (n, v) =>
      expect(tokens.get(`--color-${n}`)).toBe(v),
    );
  it('uses system font stacks', () => {
    expect(light.get('--font-sans')).toBe(
      "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    );
    expect(light.get('--font-mono')).toBe(
      "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', 'Roboto Mono', Menlo, monospace",
    );
  });
  it('has 2/4/8px radii and 0.08em wide tracking', () => {
    expect([light.get('--radius-sm'), light.get('--radius-md'), light.get('--radius-lg')]).toEqual([
      '2px',
      '4px',
      '8px',
    ]);
    expect(light.get('--tracking-wide')).toBe('0.08em');
  });
  it('has the specified shadows', () => {
    expect(light.get('--shadow-raised')).toBe(
      '0 1px 2px rgb(20 23 27 / 0.06), 0 16px 40px rgb(20 23 27 / 0.08)',
    );
    expect(light.get('--shadow-overlay')).toBe(
      '0 8px 24px rgb(20 23 27 / 0.16), 0 2px 6px rgb(20 23 27 / 0.08)',
    );
    for (const tokens of [systemDark, explicitDark]) {
      expect(tokens.get('--shadow-raised')).toBe(
        'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 16px 40px rgb(0 0 0 / 0.38)',
      );
      expect(tokens.get('--shadow-overlay')).toBe(
        '0 8px 24px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.45)',
      );
    }
  });
  it('system dark and explicit dark agree on every colour and shadow', () => {
    for (const n of [...colours, ...shadows])
      expect(systemDark.get(n), n).toBe(explicitDark.get(n));
  });
});

describe('motion and fluid tokens', () => {
  /** Resolves `clamp(min, a rem + b vw, max)` at a viewport width, in rem (16px). */
  function clampRem(value: string, vw: number): number {
    const m = value.match(
      /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/,
    );
    if (!m) throw new Error(`not a clamp(rem, rem + vw, rem): ${value}`);
    const [lo, a, b, hi] = m.slice(1).map(Number) as [number, number, number, number];
    return Math.min(hi, Math.max(lo, a + (b * vw) / 100 / 16));
  }
  it('--motion-stagger is 40ms, 0ms under reduced motion', () => {
    expect(light.get('--motion-stagger')).toBe('40ms');
    expect(reduced.get('--motion-stagger')).toBe('0ms');
  });
  it('--text-display-fluid is 2rem at 360 and 2.5rem at 1280', () => {
    const v = light.get('--text-display-fluid')!;
    expect(v).toMatch(/^clamp\(2rem,/);
    expect(clampRem(v, 360)).toBeCloseTo(2, 2);
    expect(clampRem(v, 1280)).toBeCloseTo(2.5, 2);
  });
  it('--gutter-fluid is 1rem at 360 and 2rem at 768', () => {
    const v = light.get('--gutter-fluid')!;
    expect(v).toMatch(/^clamp\(1rem,/);
    expect(clampRem(v, 360)).toBeCloseTo(1, 2);
    expect(clampRem(v, 768)).toBeCloseTo(2, 2);
  });
  it.each(['--motion-stagger', '--text-display-fluid', '--gutter-fluid'])(
    '%s is present in tokens.css',
    (n) => expect(css).toContain(n),
  );
});

describe('motion contract', () => {
  it('reduced motion zeroes the three durations', () => {
    for (const n of ['--motion-fast', '--motion-base', '--motion-slow'])
      expect(reduced.get(n)).toBe('0ms');
  });
  it('no duration exceeds 300ms', () => {
    const durations = [...light].filter(([n]) =>
      ['--motion-fast', '--motion-base', '--motion-slow'].includes(n),
    );
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

describe('block inventory (contracts/blocks.md)', () => {
  const plain = (s: string) => s.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  const spec = readFileSync(join(root, 'specs/004-web-ui-refresh/contracts/blocks.md'), 'utf-8');
  const table = spec.split('## Inventory')[1]!.split('\n## ')[0]!;
  const inventory = table
    .split(/\r?\n/)
    .filter((l) => /^\| `/.test(l))
    .map((l) => {
      const cells = l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      // backticked tokens, minus parenthesised remarks and anything after "sizes"
      const tokens = (cell: string) =>
        [
          ...cell
            .replace(/\([^)]*\)/g, '')
            .split('sizes')[0]!
            .matchAll(/`([^`]+)`/g),
        ].map((m) => m[1]!);
      return {
        block: /`([^`]+)`/.exec(cells[0]!)![1]!,
        purpose: plain(cells[1]!),
        variants: tokens(cells[2]!),
        states: tokens(cells[3]!),
      };
    });
  const charts = ['CategoryBars', 'TrendSparkline', 'YearBars'];
  const dir = (b: string) => join(here, charts.includes(b) ? 'charts' : 'components');

  it('parses every inventory row', () => {
    expect(inventory.map((i) => i.block)).toHaveLength(16);
  });
  const loadStory = async (block: string) =>
    (charts.includes(block)
      ? await import(`./charts/${block}.story.ts`)
      : await import(`./components/${block}.story.ts`)
    ).default;
  it.each(inventory.map((i) => [i.block, i] as const))('%s matches its row', async (_b, row) => {
    expect(existsSync(join(here, 'components', `${row.block}.vue`))).toBe(true);
    expect(existsSync(join(dir(row.block), `${row.block}.story.ts`))).toBe(true);
    const story = await loadStory(row.block);
    expect(story.title).toBe(row.block);
    expect(plain(story.purpose ?? '')).toBe(row.purpose);
    const has = (list: { name: string }[], v: string) => list.some((s) => s.name === v);
    const missing = [
      ...row.variants.filter((v) => !has(story.variants, v)).map((v) => `variant:${v}`),
      ...row.states.filter((v) => !has(story.states, v)).map((v) => `state:${v}`),
    ];
    expect(missing).toEqual([]);
  });

  it.each([...inventory.map((i) => i.block), ...charts].map((b) => [b] as const))(
    '%s has a usage example',
    async (block) => {
      const story = await loadStory(block);
      expect(story.usage ?? '').not.toBe('');
      expect(story.usage).toContain(`<${block}`);
    },
  );

  it('every story file belongs to the inventory or the three charts', () => {
    const known = new Set([...inventory.map((i) => i.block), ...charts]);
    const files = ['components', 'charts']
      .flatMap((d) => walk(join(here, d), '.story.ts'))
      .map((f) => basename(f).replace('.story.ts', ''));
    expect(files.filter((f) => !known.has(f))).toEqual([]);
    expect(charts.every((c) => files.includes(c))).toBe(true);
  });
});

// T054: user-selectable accent presets (FR-019). ACCENT_IDS is read by relative path because
// packages/ui does not depend on @desk/contracts.
describe('accent presets (FR-019)', () => {
  const ids = [
    ...readFileSync(join(root, 'packages/contracts/src/accent.ts'), 'utf-8').matchAll(
      /'([a-z-]+)',/g,
    ),
  ].map((m) => m[1]!);
  const presets = ids.filter((id) => id !== 'signal-green');
  // A rule counts when its selector list contains the required selector (nested-wrapper forms may follow).
  const accentRule = (selector: string): Tokens => {
    const found = rules.find((r) =>
      r.selector
        .split(',')
        .map((s) => s.trim())
        .includes(selector),
    );
    if (!found) throw new Error(`no rule "${selector}"`);
    return found.tokens;
  };
  const selectors = (id: string): [string, string, Tokens][] => [
    ['light', `:root[data-accent='${id}']`, light],
    ['system dark', `:root:not([data-theme='light'])[data-accent='${id}']`, systemDark],
    ['explicit dark', `:root[data-theme='dark'][data-accent='${id}']`, explicitDark],
  ];
  const overridden = (base: Tokens, over: Tokens): Tokens => new Map([...base, ...over]);
  const hue = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };

  it('has at most six presets, signal-green first', () => {
    expect(ids[0]).toBe('signal-green');
    expect(ids.length).toBeLessThanOrEqual(6);
    expect(presets.length).toBeGreaterThan(0);
  });

  for (const id of presets) {
    describe(id, () => {
      it.each(selectors(id))('%s overrides accent, accent-fg and selection', (_t, sel) => {
        const over = accentRule(sel);
        for (const n of ['--color-accent', '--color-accent-fg', '--color-selection']) {
          expect(over.has(n), `${sel} ${n}`).toBe(true);
        }
      });
      it('both dark blocks are equal', () => {
        const sel = selectors(id);
        expect([...accentRule(sel[1]![1])]).toEqual([...accentRule(sel[2]![1])]);
      });
      it.each(selectors(id))('%s keeps the contrast pairs', (_t, sel, base) => {
        const t = overridden(base, accentRule(sel));
        const c = (a: string, b: string) =>
          contrastRatio(resolve(t, `--color-${a}`), resolve(t, `--color-${b}`));
        expect(c('accent-fg', 'accent')).toBeGreaterThanOrEqual(4.5);
        expect(c('accent', 'bg')).toBeGreaterThanOrEqual(3);
        expect(c('accent', 'surface')).toBeGreaterThanOrEqual(3);
        expect(c('focus', 'accent')).toBeGreaterThanOrEqual(3);
        expect(c('fg', 'selection')).toBeGreaterThanOrEqual(4.5);
      });
      it.each(selectors(id))(
        '%s accent hue stays out of 0-60 degrees (status colours)',
        (_t, sel) => {
          const h = hue(accentRule(sel).get('--color-accent')!);
          expect(h < 0 || h > 60).toBe(true);
        },
      );
    });
  }
});

// Spec 006 T007: glass surface, blur, radius and motion alpha ceilings (DESIGN.md, ADR-0007).
describe('glass and motion tokens (ADR-0007)', () => {
  const lightExpect: Record<string, string> = {
    '--color-surface-glass': 'rgb(255 255 255 / 0.68)',
    '--color-glass-line': 'rgb(20 23 27 / 0.1)',
    '--shadow-raised': '0 1px 2px rgb(20 23 27 / 0.06), 0 16px 40px rgb(20 23 27 / 0.08)',
    '--motion-alpha-aurora': '0.49',
    '--motion-alpha-aurora-blue': '0.35',
    '--motion-alpha-aurora-amber': '0.32',
    '--motion-aurora-blue': '#8fb3ff',
    '--motion-aurora-amber': '#f5c27a',
    '--motion-alpha-grid': '0.042',
    '--motion-alpha-particles': '0.63',
    '--motion-alpha-grain': '0.118',
  };
  const darkExpect: Record<string, string> = {
    '--color-surface-glass': 'rgb(21 26 33 / 0.66)',
    '--color-glass-line': 'rgb(242 242 238 / 0.11)',
    '--shadow-raised': 'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 16px 40px rgb(0 0 0 / 0.38)',
    '--motion-alpha-aurora': '0.39',
    '--motion-alpha-aurora-blue': '0.32',
    '--motion-alpha-aurora-amber': '0.28',
    '--motion-aurora-blue': 'rgb(52 78 170)',
    '--motion-aurora-amber': 'rgb(140 96 30)',
    '--motion-alpha-grid': '0.098',
    '--motion-alpha-particles': '0.53',
    '--motion-alpha-grain': '0.157',
  };
  const themes: [string, Tokens, Record<string, string>][] = [
    ['light', light, lightExpect],
    ['system dark', systemDark, darkExpect],
    ['explicit dark', explicitDark, darkExpect],
  ];
  for (const [theme, tokens, expected] of themes) {
    it.each(Object.entries(expected))(`${theme}: %s`, (name, value) =>
      expect(tokens.get(name)).toBe(value),
    );
  }
  it('defines blur and radius once on the light selector', () => {
    expect(light.get('--blur-surface')).toBe('20px');
    expect(light.get('--radius-xl')).toBe('16px');
  });
});
