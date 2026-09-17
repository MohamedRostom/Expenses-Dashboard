import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

/**
 * Default migrations path, resolved next to this module at runtime. In the Fly image apps/api
 * bundles this file into dist/node.js and the Dockerfile copies migrations/ beside dist/, so the
 * same relative path holds. No caller overrides it today.
 */
export const defaultMigrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

// Arbitrary constant; every instance takes the same lock so only one migrates at a time.
const MIGRATION_LOCK_KEY = 7_461_002;

/**
 * Applies every pending SQL migration in migrationsFolder to the database at databaseUrl.
 * Serialised with a session-level advisory lock because every container runs this on boot and
 * preview apps share one database.
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  // max: 1 keeps lock, migrate and unlock on the same connection.
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  try {
    await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    }
  } finally {
    await client.end();
  }
}
