import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from '@desk/db/migrate';
import { createDb, users } from '@desk/db';

// Proves the migration pipeline from scratch on a throwaway Postgres 16, as every API test will.
describe('migrations', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('applies from an empty database and is idempotent', async () => {
    const url = container.getConnectionUri();
    await runMigrations(url);
    await runMigrations(url);

    const { db, close } = createDb(url);
    try {
      const [row] = await db.insert(users).values({ email: 'a@example.com' }).returning();
      expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
      await expect(db.insert(users).values({ email: 'a@example.com' })).rejects.toThrow(/unique/i);
    } finally {
      await close();
    }
  });
});
