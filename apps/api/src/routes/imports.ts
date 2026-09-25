import { Hono } from 'hono';
import { ColumnMapping, CommitImportRequest, SaveImportProfileRequest } from '@desk/contracts';
import type { Db } from '@desk/db';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';
import { createImportsService } from '../services/imports.js';
import type { ExpensesService } from '../services/expenses.js';

export type ImportsRoutesDeps = { db: Db; expensesService: ExpensesService };

/** GET/PUT /imports/profiles/:name, POST /imports, POST /imports/:id/commit,
 * POST /imports/:id/undo. */
export function createImportsRoutes(deps: ImportsRoutesDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const service = createImportsService(deps.db, deps.expensesService);

  app.get('/imports/profiles', async (c) => {
    const user = requireAuth(c);
    const profiles = await service.listProfiles(user.id);
    return c.json({ profiles });
  });

  app.put('/imports/profiles/:name', async (c) => {
    const user = requireAuth(c);
    const { mapping } = SaveImportProfileRequest.parse(await c.req.json());
    const profile = await service.saveProfile(user.id, c.req.param('name'), mapping);
    return c.json({ profile });
  });

  app.post('/imports', async (c) => {
    const user = requireAuth(c);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new ApiError('validation_failed', 'file is required', 400);
    }
    const mappingRaw = body.mapping;
    if (typeof mappingRaw !== 'string') {
      throw new ApiError('validation_failed', 'mapping is required', 400);
    }
    const mapping = ColumnMapping.parse(JSON.parse(mappingRaw));
    const profileId = typeof body.profileId === 'string' ? body.profileId : null;

    const text = await file.text();
    const batch = await service.preview(user.id, file.name, file.size, text, profileId, mapping);
    return c.json({ batch }, 201);
  });

  app.post('/imports/:id/commit', async (c) => {
    const user = requireAuth(c);
    const input = CommitImportRequest.parse(await c.req.json().catch(() => ({})));
    const batch = await service.commit(user.id, user.defaultCurrency, c.req.param('id'), input);
    return c.json({ batch });
  });

  app.post('/imports/:id/undo', async (c) => {
    const user = requireAuth(c);
    const result = await service.undo(user.id, c.req.param('id'));
    return c.json(result);
  });

  return app;
}
