import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb } from './index.js';

/** Where the SQL migrations live in the source tree; containers that copy them elsewhere pass their own path. */
export const defaultMigrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/** Applies every pending SQL migration in migrationsFolder to the database at databaseUrl. */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  const { db, close } = createDb(databaseUrl);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
