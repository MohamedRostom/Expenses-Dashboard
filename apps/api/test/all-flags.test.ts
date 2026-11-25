import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FLAGS } from '@desk/db';

const root = join(import.meta.dirname, '..', '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|vue)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

// Every place the code asks "is this flag on?" by literal key. `widgets.${kind}` is covered by
// ALL_FLAGS being built from WIDGET_KINDS.
const CHECKS = [
  /isOn\('([a-z]+\.[a-z_]+)'\)/g,
  /flags\['([a-z]+\.[a-z_]+)'\]/g,
  /requireFlag\([^,]+,\s*'([a-z]+\.[a-z_]+)'/g,
  /resolveFlag\([^)]*'([a-z]+\.[a-z_]+)'/g,
  /flag: '([a-z]+\.[a-z_]+)'/g,
];

describe('ALL_FLAGS', () => {
  it('lists every flag key the web and api code checks, so FLAGS_ON=all cannot miss one', () => {
    const used = new Set<string>();
    for (const dir of ['apps/api/src', 'apps/web/src'])
      for (const file of sources(join(root, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const re of CHECKS) for (const m of text.matchAll(re)) used.add(m[1]!);
      }
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter((k) => !ALL_FLAGS.includes(k))).toEqual([]);
  });

  it('matches the flags the migrations and seed create', () => {
    const seed = readFileSync(join(root, 'packages/db/src/seed.ts'), 'utf8');
    const seeded = [...seed.matchAll(/key: '((?:panels|appearance|widgets)\.[a-z_]+)'/g)]
      .map((m) => m[1]!)
      .filter((k) => !k.endsWith('_until'));
    expect([...ALL_FLAGS].sort()).toEqual(seeded.sort());
  });
});
