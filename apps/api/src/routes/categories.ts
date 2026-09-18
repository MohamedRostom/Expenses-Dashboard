import { Hono } from 'hono';
import { CreateCategoryRequest, PatchCategoryRequest } from '@desk/contracts';
import type { Db } from '@desk/db';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { createCategoriesService } from '../services/categories.js';

/** GET/POST /categories, PATCH/DELETE /categories/:id. */
export function createCategoriesRoutes(db: Db) {
  const app = new Hono<{ Variables: AppVariables }>();
  const service = createCategoriesService(db);

  app.get('/categories', async (c) => {
    const user = requireAuth(c);
    const categories = await service.list(user.id);
    return c.json({ categories });
  });

  app.post('/categories', async (c) => {
    const user = requireAuth(c);
    const input = CreateCategoryRequest.parse(await c.req.json());
    const category = await service.create(user.id, input);
    return c.json({ category }, 201);
  });

  app.patch('/categories/:id', async (c) => {
    const user = requireAuth(c);
    const input = PatchCategoryRequest.parse(await c.req.json());
    const category = await service.patch(user.id, c.req.param('id'), input);
    return c.json({ category });
  });

  app.delete('/categories/:id', async (c) => {
    const user = requireAuth(c);
    await service.remove(user.id, c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
