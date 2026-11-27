import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from '@desk/db/migrate';
import { createDb, users } from '@desk/db';
import postgres from 'postgres';

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

  // Migration 0016: an index behind each column a query filters, ranges or sorts on.
  it('indexes the columns queries search and sort by', async () => {
    const url = container.getConnectionUri();
    await runMigrations(url);
    const sql = postgres(url);
    try {
      const rows = await sql<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'`;
      const defs = rows.map((r) => r.indexdef.replace(/"/g, ''));
      for (const want of [
        'ON public.expenses USING btree (user_id, id)', // list keyset paging, currency re-derive
        'ON public.fx_rates USING btree (base, quote, rate_date)', // rate lookup, newest first
        'ON public.cached_events USING btree (account_id, starts_at)', // refresh window prune
        'ON public.connected_accounts USING btree (next_refresh_at)', // scheduler due scan
        'ON public.jobs USING btree (name, status)', // "already queued?" checks
        'ON public.users USING btree (last_active_at)', // idle purge
        'ON public.users USING btree (created_at) WHERE (email_verified_at IS NULL)', // unverified sweep
        'ON public.audit_log USING btree (created_at)', // retention delete
        'ON public.expense_versions USING btree (expense_id, created_at)', // history, oldest first
        'ON public.expense_versions USING btree (created_at)', // retention delete
        'ON public.rate_limits USING btree (window_start)', // expired-window sweep
      ]) {
        expect(
          defs.some((d) => d.endsWith(want)),
          want,
        ).toBe(true);
      }
    } finally {
      await sql.end();
    }
  });
});
