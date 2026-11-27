import { and, eq } from 'drizzle-orm';
import { flags, userFlags, users } from './schema.js';
import { WIDGET_KINDS } from '@desk/core';
import type { Db } from './index.js';

/** Every boolean flag key. FLAGS_ON=all (preview deploys) switches on exactly these. A new flag
 * goes here and in seed.ts; apps/api/test/all-flags.test.ts fails if either is missed. */
export const ALL_FLAGS: readonly string[] = [
  'panels.today',
  'panels.google_calendar',
  'panels.google_mail',
  'panels.microsoft',
  'panels.standards',
  'appearance.accent',
  'appearance.motion',
  ...WIDGET_KINDS.map((k) => `widgets.${k}`),
];

/** Global flag rows change only by deploy or the flags CLI, yet every flag-gated request reads
 * them, so each Db keeps them in memory for FLAG_TTL_MS. setGlobalFlag clears this process's copy
 * at once; a write from another process (the CLI, another machine) shows within the TTL, the same
 * minute GET /flags/public already allows a kill-switch flip. Per-user overrides are not cached. */
const FLAG_TTL_MS = 60_000;
const globalCache = new WeakMap<Db, { at: number; rows: Promise<(typeof flags.$inferSelect)[]> }>();

function globalFlags(db: Db) {
  const hit = globalCache.get(db);
  if (hit && Date.now() - hit.at < FLAG_TTL_MS) return hit.rows;
  const rows = (async () => db.select().from(flags))();
  globalCache.set(db, { at: Date.now(), rows });
  rows.catch(() => globalCache.delete(db)); // never keep a failed read
  return rows;
}

/** Effective flag value for a user: their per-user override if one exists, else the flag's
 * global default_on, else false for an unknown key. */
export async function resolveFlag(db: Db, userId: string, key: string): Promise<boolean> {
  const [override] = await db
    .select()
    .from(userFlags)
    .where(and(eq(userFlags.userId, userId), eq(userFlags.key, key)));
  if (override) return override.enabled;

  return (await globalFlags(db)).find((f) => f.key === key)?.defaultOn ?? false;
}

/** All flags resolved for a user (GET /flags), global defaults overlaid with their overrides. */
export async function resolveAllFlags(db: Db, userId: string): Promise<Record<string, boolean>> {
  const allFlags = await globalFlags(db);
  const overrides = await db.select().from(userFlags).where(eq(userFlags.userId, userId));
  const overrideByKey = new Map(overrides.map((o) => [o.key, o.enabled]));

  const result: Record<string, boolean> = {};
  // Value rows (key ends `_until`, data in flags.value) are not booleans: keep them out of /flags.
  for (const f of allFlags.filter((f) => !f.key.endsWith('_until')))
    result[f.key] = overrideByKey.get(f.key) ?? f.defaultOn;
  return result;
}

/** Sets a flag's global default (upserts the `flags` row; description defaults to the key). */
export async function setGlobalFlag(db: Db, key: string, on: boolean): Promise<void> {
  await db
    .insert(flags)
    .values({ key, description: key, defaultOn: on })
    .onConflictDoUpdate({ target: flags.key, set: { defaultOn: on } });
  globalCache.delete(db);
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
