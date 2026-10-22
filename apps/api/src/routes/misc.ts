import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { CURRENCIES } from '@desk/core';
import { flags as flagsTable, resolveAllFlags, jobs as jobsTable, type Db } from '@desk/db';
import type { CurrenciesResponseT, JobResponseT, FlagsResponseT } from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';

/** Flags a signed-out page may read (spec 006 R5). Add a key only if its value is safe to publish. */
const PUBLIC_FLAGS = ['appearance.motion'];

/** GET /currencies, GET /jobs/:id, GET /flags, GET /flags/public. */
export function createMiscRoutes(db: Db) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/currencies', (c) => {
    const body: CurrenciesResponseT = { currencies: CURRENCIES.map((cur) => ({ ...cur })) };
    return c.json(body);
  });

  app.get('/jobs/:id', async (c) => {
    const user = requireAuth(c);
    const id = c.req.param('id');
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || job.userId !== user.id) throw new ApiError('not_found', 'Job not found', 404);

    const body: JobResponseT = {
      id: job.id,
      name: job.name,
      status: job.status as JobResponseT['status'],
      progressDone: job.progressDone,
      progressTotal: job.progressTotal,
      error: job.error,
    };
    return c.json(body);
  });

  app.get('/flags', async (c) => {
    const user = requireAuth(c);
    const flags = await resolveAllFlags(db, user.id);
    const body: FlagsResponseT = { flags };
    return c.json(body);
  });

  // Unauthenticated: global defaults only, never per-user overrides. 60 s keeps a kill-switch flip prompt.
  app.get('/flags/public', async (c) => {
    const rows = await db.select().from(flagsTable).where(inArray(flagsTable.key, PUBLIC_FLAGS));
    const flags = Object.fromEntries(
      PUBLIC_FLAGS.map((k) => [k, rows.find((r) => r.key === k)?.defaultOn ?? false]),
    );
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ flags } satisfies FlagsResponseT);
  });

  return app;
}
