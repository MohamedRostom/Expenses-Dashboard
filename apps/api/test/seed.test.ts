import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { DEFAULT_CATEGORIES } from '@desk/core';
import { runMigrations } from '@desk/db/migrate';
import { seed } from '@desk/db/seed';
import { categories, createDb, users } from '@desk/db';

const SEED_CLI = fileURLToPath(new URL('../../../packages/db/src/seed.ts', import.meta.url));

describe('db seed', () => {
  // The isMain guard compared `file://C:/…` with import.meta.url's `file:///C:/…`, so on Windows
  // `pnpm db:seed` exited 0 without doing anything. No DATABASE_URL must reach the guard's body.
  it('runs as a CLI on every OS (fails loudly without DATABASE_URL)', () => {
    const env = { ...process.env };
    delete env['DATABASE_URL'];
    const res = spawnSync(process.execPath, ['--import', 'tsx', SEED_CLI], {
      env,
      encoding: 'utf8',
    });
    expect(res.stderr).toContain('DATABASE_URL is required');
    expect(res.status).toBe(1);
  });

  describe('against Postgres', () => {
    let container: StartedPostgreSqlContainer;

    beforeAll(async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      await runMigrations(container.getConnectionUri());
    });

    afterAll(async () => {
      await container?.stop();
    });

    it('gives the fixture user the default categories, idempotently', async () => {
      const url = container.getConnectionUri();
      await seed(url);
      await seed(url);

      const { db, close } = createDb(url);
      try {
        const [user] = await db.select().from(users).where(eq(users.email, 'e2e@desk.test'));
        expect(user).toBeDefined();
        const rows = await db
          .select({ name: categories.name, defaultKind: categories.defaultKind })
          .from(categories)
          .where(eq(categories.userId, user!.id));
        expect(rows.map((r) => r.name).sort()).toEqual(
          DEFAULT_CATEGORIES.map((c) => c.name).sort(),
        );
        expect(rows.find((r) => r.name === 'Rent')?.defaultKind).toBe('fixed');
      } finally {
        await close();
      }
    });
  });
});
