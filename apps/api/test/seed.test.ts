import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, like } from 'drizzle-orm';
import { DEFAULT_CATEGORIES } from '@desk/core';
import { runMigrations } from '@desk/db/migrate';
import { seed } from '@desk/db/seed';
import { categories, createDb, flags, resolveAllFlags, users } from '@desk/db';

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

    const WIDGET_FLAGS = [
      'widgets.currency',
      'widgets.weather',
      'widgets.sunrise',
      'widgets.spend_pace',
      'widgets.fixed_costs',
    ];

    it('seeds the widgets.* flags off, once, plus the paused_until value row', async () => {
      const url = container.getConnectionUri();
      await seed(url);
      await seed(url);
      const { db, close } = createDb(url);
      try {
        const rows = await db.select().from(flags).where(like(flags.key, 'widgets.%'));
        expect(rows.map((r) => r.key).sort()).toEqual(
          [...WIDGET_FLAGS, 'widgets.weather_paused_until'].sort(),
        );
        expect(rows.every((r) => !r.defaultOn)).toBe(true);
        expect(rows.find((r) => r.key === 'widgets.weather_paused_until')?.value).toBeNull();

        const [user] = await db.select().from(users).where(eq(users.email, 'e2e@desk.test'));
        const resolved = await resolveAllFlags(db, user!.id);
        expect(Object.keys(resolved)).toEqual(expect.arrayContaining(WIDGET_FLAGS));
        expect(resolved).not.toHaveProperty('widgets.weather_paused_until');
      } finally {
        await close();
      }
    });

    it('flagsOn switches the five widgets.* flags on but not paused_until', async () => {
      const url = container.getConnectionUri();
      const { db, close } = createDb(url);
      try {
        await db.delete(flags).where(like(flags.key, 'widgets.%')); // seed never overwrites rows
        await seed(url, { flagsOn: true });
        const on = Object.fromEntries(WIDGET_FLAGS.map((k) => [k, true]));
        const rows = await db.select().from(flags).where(like(flags.key, 'widgets.%'));
        for (const r of rows) expect(r.defaultOn).toBe(r.key in on);
      } finally {
        await close();
      }
    });
  });
});
