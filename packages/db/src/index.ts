import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export * from './schema.js';
export { ALL_FLAGS, resolveFlag, resolveAllFlags, setGlobalFlag, setUserFlag } from './flags.js';

/** `options` passes through to postgres-js (tests use `debug` to count queries). */
export function createDb(databaseUrl: string, options?: postgres.Options<Record<string, never>>) {
  const client = postgres(databaseUrl, options);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
export type Db = ReturnType<typeof createDb>['db'];
