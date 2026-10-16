import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { ACCENT_IDS } from '@desk/contracts';
import { eq } from 'drizzle-orm';
import { runMigrations } from '@desk/db/migrate';
import { createDb, users } from '@desk/db';

describe('users.accent migration', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runMigrations(container.getConnectionUri());
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('defaults to signal-green and rejects unknown ids', async () => {
    const { db, close } = createDb(container.getConnectionUri());
    try {
      const [u] = await db
        .insert(users)
        .values({ email: 'accent@desk.test', defaultCurrency: 'GBP' })
        .returning();
      expect(u!.accent).toBe('signal-green');
      await expect(
        db.update(users).set({ accent: 'zzz' }).where(eq(users.id, u!.id)),
      ).rejects.toThrow();
      await expect(
        db
          .insert(users)
          .values({ email: 'accent2@desk.test', defaultCurrency: 'GBP', accent: 'zzz' }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  // Lives here, not in contracts, because contracts has no node types.
  it('CHECK lists every ACCENT_IDS entry', () => {
    const sql = readFileSync(
      new URL('../../../packages/db/migrations/0011_user_accent.sql', import.meta.url),
      'utf8',
    );
    for (const id of ACCENT_IDS) expect(sql).toContain(`'${id}'`);
  });
});
