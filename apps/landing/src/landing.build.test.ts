import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MOTION_DARK_TINT } from '@desk/contracts';

// Builds the real static site (vite-ssg) twice and checks the emitted HTML. Slow on purpose:
// the flag is read at build time, so only a build proves it (spec 006 FR-021).
const dirs: string[] = [];
function build(motion: string | undefined): (page: string) => string {
  const out = mkdtempSync(join(tmpdir(), 'landing-'));
  dirs.push(out);
  const env: NodeJS.ProcessEnv = { ...process.env, LANDING_OUT_DIR: out };
  delete env['VITE_APPEARANCE_MOTION'];
  if (motion !== undefined) env['VITE_APPEARANCE_MOTION'] = motion;
  execSync('pnpm exec vite-ssg build', { cwd: join(__dirname, '..'), env, stdio: 'pipe' });
  return (page) => readFileSync(join(out, page), 'utf8');
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('landing build', { timeout: 180_000 }, () => {
  it('has no motion layer by default and puts the content on .surface panels', () => {
    const read = build(undefined);
    const index = read('index.html');
    expect(index).not.toContain('desk-motion');
    expect(index).not.toContain('data-motion');
    for (const cls of ['hero', 'steps', 'screenshots']) {
      expect(index).toMatch(new RegExp(`<section[^>]*class="[^"]*\\b${cls}\\b[^"]*\\bsurface\\b`));
    }
    for (const page of ['privacy.html', 'terms.html']) {
      expect(read(page)).toMatch(/<main[^>]*class="[^"]*\bsurface\b/);
    }
  });

  it('mounts Particles in the Signal mint tints when VITE_APPEARANCE_MOTION is true', () => {
    const read = build('true');
    const index = read('index.html');
    expect(index).toMatch(/<html[^>]*data-motion="particles"/);
    expect(index).toContain('data-testid="background-motion"');
    expect(index).toContain('--motion-tint:#7fd1a8');
    expect(index).toContain(`--motion-tint:${MOTION_DARK_TINT}`);
    expect(read('privacy.html')).toMatch(/<html[^>]*data-motion="particles"/);
  });
});
