// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

// T012 / research R5: the UI catalogue (`/__ui`) is a dev and preview tool. A normal production
// build must not ship it; only VITE_UI_CATALOGUE=true emits a `catalogue` chunk.
const root = process.cwd(); // vitest runs from apps/web

function walk(dir: string, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`],
  );
}

async function buildWith(flag: string | undefined) {
  const outDir = mkdtempSync(join(tmpdir(), 'desk-bundle-'));
  const prev = process.env['VITE_UI_CATALOGUE'];
  if (flag === undefined) delete process.env['VITE_UI_CATALOGUE'];
  else process.env['VITE_UI_CATALOGUE'] = flag;
  try {
    await build({
      root,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, reportCompressedSize: false },
    });
    return { files: walk(outDir), html: readFileSync(join(outDir, 'index.html'), 'utf8') };
  } finally {
    if (prev === undefined) delete process.env['VITE_UI_CATALOGUE'];
    else process.env['VITE_UI_CATALOGUE'] = prev;
    rmSync(outDir, { recursive: true, force: true });
  }
}

describe('catalogue bundle', () => {
  it('ships no catalogue, proposed-tokens or story file when VITE_UI_CATALOGUE is unset', async () => {
    const { files, html } = await buildWith(undefined);
    const banned = /catalogue|proposed-tokens|\.story/i;
    expect(files.filter((f) => banned.test(f))).toEqual([]);
    expect(html).not.toMatch(banned);
  }, 240_000);

  // enabled by T021 (the catalogue view does not exist yet)
  it.todo('emits a catalogue chunk when VITE_UI_CATALOGUE is true');
});
