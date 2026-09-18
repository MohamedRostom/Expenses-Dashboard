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

  it('serialises concurrent runs so two booting containers cannot race', async () => {
    const container2 = await new PostgreSqlContainer('postgres:16-alpine').start();
    try {
      const url = container2.getConnectionUri();
      await expect(
        Promise.all([runMigrations(url), runMigrations(url), runMigrations(url)]),
      ).resolves.toBeDefined();
    } finally {
      await container2.stop();
    }
  });

  it('applies from an empty database and is idempotent', async () => {
    const url = container.getConnectionUri();
    await runMigrations(url);
    await runMigrations(url);

    const { db, close } = createDb(url);
    try {
      const [row] = await db
        .insert(users)
        .values({ email: 'a@example.com', defaultCurrency: 'GBP' })
        .returning();
      expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
      // Drizzle wraps driver errors; 23505 is Postgres' unique_violation.
      await expect(
        db.insert(users).values({ email: 'a@example.com', defaultCurrency: 'GBP' }),
      ).rejects.toMatchObject({
        cause: { code: '23505' },
      });
    } finally {
      await close();
    }
  });
});
