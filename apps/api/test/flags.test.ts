import { resolveFlag, setGlobalFlag, setUserFlag } from '@desk/db';
import { startHarness, type ApiClient, type Harness } from './harness.js';

/**
 * T042a: proves the flags-cli logic (packages/db/src/flags-cli.ts, built on
 * packages/db/src/flags.ts) writes rows that `resolveFlag` picks up immediately — no restart,
 * no cache. There is no `GET /flags` route yet (that's T042), so this proves the effective
 * flag resolution logic a later route handler will call directly.
 */
describe('flags: operator switch reflects on the next read', () => {
  let harness: Harness;
  let user: ApiClient & { userId: string };

  beforeAll(async () => {
    harness = await startHarness();
    user = await harness.asUser('flags-user@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it('an unknown flag resolves false', async () => {
    expect(await resolveFlag(harness.db, user.userId, 'never-seen')).toBe(false);
  });

  it('--global on turns the flag on for everyone, then --global off turns it back off', async () => {
    await setGlobalFlag(harness.db, 'new-dashboard', true);
    expect(await resolveFlag(harness.db, user.userId, 'new-dashboard')).toBe(true);

    await setGlobalFlag(harness.db, 'new-dashboard', false);
    expect(await resolveFlag(harness.db, user.userId, 'new-dashboard')).toBe(false);
  });

  it('--user overrides the global default for that user only', async () => {
    await setGlobalFlag(harness.db, 'beta-import', false);
    const otherUser = await harness.asUser('flags-other@example.com');

    await setUserFlag(harness.db, 'flags-user@example.com', 'beta-import', true);

    expect(await resolveFlag(harness.db, user.userId, 'beta-import')).toBe(true);
    expect(await resolveFlag(harness.db, otherUser.userId, 'beta-import')).toBe(false);
  });
});
