import { createDb } from './index.js';
import { setGlobalFlag, setUserFlag } from './flags.js';

/** `pnpm flags set <key> --user <email>|--global on|off` (T042a). Parses argv, writes to
 * `flags`/`user_flags`, effective on the next request (no cache, no restart needed). */
const USAGE = 'usage: flags set <key> --user <email>|--global on|off';

export async function runFlagsCli(argv: string[], databaseUrl: string | undefined): Promise<void> {
  const [cmd, key, ...rest] = argv;
  const state = rest[rest.length - 1];
  if (cmd !== 'set' || !key || (state !== 'on' && state !== 'off')) throw new Error(USAGE);
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const on = state === 'on';
  const { db, close } = createDb(databaseUrl);
  try {
    if (rest[0] === '--global' && rest.length === 2) {
      await setGlobalFlag(db, key, on);
    } else if (rest[0] === '--user' && rest.length === 3 && rest[1]) {
      await setUserFlag(db, rest[1], key, on);
    } else {
      throw new Error(USAGE);
    }
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  await runFlagsCli(process.argv.slice(2), process.env['DATABASE_URL']);
  console.log('flag updated');
}
