import { and, eq } from 'drizzle-orm';
import { flags, userFlags, users } from './schema.js';
import type { Db } from './index.js';

/** Effective flag value for a user: their per-user override if one exists, else the flag's
 * global default_on, else false for an unknown key. */
export async function resolveFlag(db: Db, userId: string, key: string): Promise<boolean> {
  const [override] = await db
    .select()
    .from(userFlags)
    .where(and(eq(userFlags.userId, userId), eq(userFlags.key, key)));
  if (override) return override.enabled;

  const [flag] = await db.select().from(flags).where(eq(flags.key, key));
  return flag?.defaultOn ?? false;
}

/** All flags resolved for a user (GET /flags), global defaults overlaid with their overrides. */
export async function resolveAllFlags(db: Db, userId: string): Promise<Record<string, boolean>> {
  const allFlags = await db.select().from(flags);
  const overrides = await db.select().from(userFlags).where(eq(userFlags.userId, userId));
  const overrideByKey = new Map(overrides.map((o) => [o.key, o.enabled]));

  const result: Record<string, boolean> = {};
  for (const f of allFlags) result[f.key] = overrideByKey.get(f.key) ?? f.defaultOn;
  return result;
}

/** Sets a flag's global default (upserts the `flags` row; description defaults to the key). */
export async function setGlobalFlag(db: Db, key: string, on: boolean): Promise<void> {
  await db
    .insert(flags)
    .values({ key, description: key, defaultOn: on })
    .onConflictDoUpdate({ target: flags.key, set: { defaultOn: on } });
}

/** Sets a flag for one user by email (upserts the `user_flags` row). Throws if the email or the
 * flag key doesn't exist — the flags table row must be created first (setGlobalFlag or a seed). */
export async function setUserFlag(db: Db, email: string, key: string, on: boolean): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new Error(`flags: no user with email ${email}`);

  const [flag] = await db.select().from(flags).where(eq(flags.key, key));
  if (!flag) throw new Error(`flags: unknown flag key ${key} (create it with --global first)`);

  await db
    .insert(userFlags)
    .values({ userId: user.id, key, enabled: on })
    .onConflictDoUpdate({ target: [userFlags.userId, userFlags.key], set: { enabled: on } });
}
