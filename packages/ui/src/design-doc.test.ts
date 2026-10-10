import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// T022: the root DESIGN.md follows data-model.md §Design direction (impeccable's format plus the
// spec 004 sections). Parsed by hand: only the frontmatter's top-level keys and its colors block
// are read, so no YAML dependency is needed.
const root = fileURLToPath(new URL('../../..', import.meta.url));
const doc = readFileSync(join(root, 'DESIGN.md'), 'utf-8').replace(/\r\n/g, '\n');
const tokensCss = readFileSync(join(root, 'packages/ui/src/tokens.css'), 'utf-8').toLowerCase();

const fm = doc.match(/^---\n([\s\S]*?)\n---\n/);
const frontmatter = fm?.[1] ?? '';
const body = fm ? doc.slice(fm[0].length) : doc;

function section(heading: string): string {
  const start = body.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const rest = body.slice(start + heading.length + 5);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

const CANONICAL = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
];
const SPEC = [
  'References',
  'Decisions',
  'Motion',
  'Taste dials',
  'Mock-ups',
  'Fallback',
  'Building a new panel',
];
const STATES = ['Captured', 'Draft', 'Proposed', 'Approved', 'Approved-fallback'];
// One row per CLAUDE.md design-system decision, plus the 2026-10-05 capture decisions.
const DECISIONS = [
  'IBM Plex',
  'accent',
  'background',
  'warn',
  'critical',
  'three theme states',
  'hand-written',
  'status colours',
  'lifted surfaces',
  'focus',
  'Ledger Desk',
];

describe('DESIGN.md (data-model.md §Design direction)', () => {
  it('has frontmatter with only the DESIGN.md schema keys', () => {
    expect(fm, 'YAML frontmatter missing').not.toBeNull();
    const keys = [...frontmatter.matchAll(/^([\w-]+):/gm)].map((m) => m[1]);
    const allowed = [
      'name',
      'description',
      'colors',
      'typography',
      'rounded',
      'spacing',
      'components',
    ];
    expect(keys.filter((k) => !allowed.includes(k!))).toEqual([]);
  });

  it('keeps every frontmatter colour equal to a token value', () => {
    const block = frontmatter.match(/^colors:\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? '';
    const values = [...block.matchAll(/^\s+[\w-]+:\s*"?([^"\n]+?)"?\s*$/gm)].map((m) =>
      m[1]!.toLowerCase(),
    );
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !tokensCss.includes(v))).toEqual([]);
  });

  it('has the eight canonical sections, then the seven spec sections, in order', () => {
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    expect(headings).toEqual([...CANONICAL, ...SPEC]);
  });

  it('states its lifecycle state in the Overview', () => {
    const state = section('Overview').match(/^State:\s*(\S+)/m)?.[1];
    expect(STATES).toContain(state);
  });

  it('names at most three references, each with a licence and a file under docs/design/references/', () => {
    const refs = section('References');
    const files = [
      ...new Set(
        [...refs.matchAll(/docs\/design\/references\/[\w.-]+\.DESIGN\.md/g)].map((m) => m[0]),
      ),
    ];
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.length).toBeLessThanOrEqual(3);
    for (const file of files) expect(existsSync(join(root, file)), file).toBe(true);
    expect((refs.match(/licen[cs]e/gi) ?? []).length).toBeGreaterThanOrEqual(files.length);
  });

  it('values every design-system decision kept, adjusted or replaced', () => {
    const rows = section('Decisions')
      .split('\n')
      .filter((l) => l.startsWith('|') && !/^\|[\s:-]+\|/.test(l))
      .slice(1); // drop the header row
    expect(rows.length).toBeGreaterThanOrEqual(DECISIONS.length);
    for (const row of rows) expect(row, row).toMatch(/\|\s*(kept|adjusted|replaced)\b/i);
    for (const decision of DECISIONS) {
      expect(
        rows.some((r) => r.toLowerCase().includes(decision.toLowerCase())),
        `no row for "${decision}"`,
      ).toBe(true);
    }
  });
});
