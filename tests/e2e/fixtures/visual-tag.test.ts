import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Host-run projects exclude @visual (grepInvert), so a screenshot assertion in an untagged
// test would run outside the pinned Playwright image and flake. Fail it here, at unit speed.
// TEMPORARY (T010 removes it): year.spec.ts predates the tag and is retagged in T010.
const ALLOW = ['year.spec.ts'];

const dir = new URL('../tests/', import.meta.url);

test('every test using toHaveScreenshot is tagged @visual', () => {
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.spec.ts'))) {
    if (ALLOW.includes(file)) continue;
    // ponytail: splits on `test(` openers; a title is whatever precedes the body's `async`.
    const blocks = readFileSync(new URL(file, dir), 'utf8')
      .split(/^\s*test(?:\.\w+)?\(/m)
      .slice(1);
    for (const block of blocks) {
      if (!block.includes('toHaveScreenshot')) continue;
      const title = block.split(/async/)[0] ?? '';
      if (!title.includes('@visual')) offenders.push(`${file}: ${title.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
