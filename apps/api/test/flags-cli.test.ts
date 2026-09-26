import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FLAGS_CLI = fileURLToPath(new URL('../../../packages/db/src/flags-cli.ts', import.meta.url));

describe('flags CLI', () => {
  // Same Windows isMain bug seed.ts had: `new URL('C:\\…', 'file:')` parses `c:` as the scheme,
  // so `pnpm flags set` exited 0 without writing anything.
  it('runs as a CLI on every OS (fails loudly without DATABASE_URL)', () => {
    const env = { ...process.env };
    delete env['DATABASE_URL'];
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', FLAGS_CLI, 'set', 'panels.today', '--global', 'on'],
      { env, encoding: 'utf8' },
    );
    expect(res.stderr).toContain('DATABASE_URL is required');
    expect(res.status).toBe(1);
  });
});
