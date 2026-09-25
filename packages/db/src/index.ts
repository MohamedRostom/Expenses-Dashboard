import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export * from './schema.js';
export { resolveFlag, resolveAllFlags, setGlobalFlag, setUserFlag } from './flags.js';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
export type Db = ReturnType<typeof createDb>['db'];
