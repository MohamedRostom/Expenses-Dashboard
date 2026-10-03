import { Hono } from 'hono';
import { resolveAllFlags, type Db } from '@desk/db';
import {
  OrderBody,
  WidgetCreate,
  WidgetPatch,
  type WidgetsRefreshResponseT,
  type WidgetResponseT,
  type WidgetsResponseT,
  type WidgetTypesResponseT,
} from '@desk/contracts';
import { WIDGET_LIMIT } from '@desk/core';
import type { AppVariables } from '../app.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import { ApiError } from '../lib/api-error.js';
import { requireAuth } from '../lib/require-auth.js';
import type { SessionUser } from '../middleware/session.js';
import { createWidgetsService, type WidgetRow } from '../services/widgets.js';
import { figuresFor } from '../services/widget-figures.js';

/** GET/POST /widgets, GET /widgets/types, PUT /widgets/order, POST /widgets/refresh, PATCH/DELETE /widgets/:id. */
export function createWidgetsRoutes(db: Db, clock: { now(): Date }, limiter: RateLimiter) {
  const app = new Hono<{ Variables: AppVariables }>();
  const service = createWidgetsService(db, clock);

  async function present(user: SessionUser, rows: WidgetRow[], flags: Record<string, boolean>) {
    const figures = await figuresFor(db, user, rows, flags, clock.now());
    return rows.map((r) => ({ ...r, ...figures.get(r.id)! })) as WidgetsResponseT['widgets'];
  }

  app.get('/widgets', async (c) => {
    const user = requireAuth(c);
    const flags = await resolveAllFlags(db, user.id);
    const body: WidgetsResponseT = {
      widgets: await present(user, await service.list(user), flags),
      limit: WIDGET_LIMIT,
      temperatureUnit: user.temperatureUnit === 'F' ? 'F' : 'C',
    };
    return c.json(body);
  });

  app.get('/widgets/types', async (c) => {
    const user = requireAuth(c);
    const body: WidgetTypesResponseT = {
      types: await service.typesFor(user, await resolveAllFlags(db, user.id)),
    };
    return c.json(body);
  });

  app.post('/widgets', async (c) => {
    const user = requireAuth(c);
    const input = WidgetCreate.parse(await c.req.json());
    const flags = await resolveAllFlags(db, user.id);
    const row = await service.create(user, input, flags);
    const [widget] = await present(user, [row], flags);
    return c.json({ widget } as WidgetResponseT, 201);
  });

  app.put('/widgets/order', async (c) => {
    const user = requireAuth(c);
    const { ids } = OrderBody.parse(await c.req.json());
    const rows = await service.reorder(user, ids);
    const body: WidgetsResponseT = {
      widgets: await present(user, rows, await resolveAllFlags(db, user.id)),
      limit: WIDGET_LIMIT,
      temperatureUnit: user.temperatureUnit === 'F' ? 'F' : 'C',
    };
    return c.json(body);
  });

  app.post('/widgets/refresh', async (c) => {
    const user = requireAuth(c);
    if (!(await limiter.hit(`widgets.refresh:${user.id}`, 1, 60_000))) {
      throw new ApiError('rate_limited', 'Refresh was just requested; try again shortly', 429);
    }
    const body: WidgetsRefreshResponseT = { queued: await service.markDue(user) };
    return c.json(body, 202);
  });

  app.patch('/widgets/:id', async (c) => {
    const user = requireAuth(c);
    const input = WidgetPatch.parse(await c.req.json());
    const row = await service.patch(user, c.req.param('id'), input);
    const [widget] = await present(user, [row], await resolveAllFlags(db, user.id));
    return c.json({ widget } as WidgetResponseT);
  });

  app.delete('/widgets/:id', async (c) => {
    const user = requireAuth(c);
    await service.remove(user, c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
