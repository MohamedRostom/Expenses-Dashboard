import { Hono } from 'hono';
import {
  CreateExpenseRequest,
  PatchExpenseRequest,
  ListExpensesQuery,
  type ListExpensesResponseT,
} from '@desk/contracts';
import type { Db } from '@desk/db';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { createExpensesService, type Clock } from '../services/expenses.js';
import type { RatesService } from '../services/rates.js';

export type ExpensesRoutesDeps = {
  db: Db;
  rates: RatesService;
  clock: Clock;
  /** T080 R8: fires (fire-and-forget) after a successful write so a connected Notion sync
   * can debounce itself in soon rather than waiting for the 5-minute cron. Undefined when
   * Notion isn't configured for this deployment. */
  onWrite?: ((userId: string) => void) | undefined;
};

function parseIncludeDeleted(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === 'true';
}

/** GET/POST /expenses, PATCH/DELETE /expenses/:id, POST /expenses/:id/restore. */
export function createExpensesRoutes(deps: ExpensesRoutesDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const service = createExpensesService(deps.db, deps.rates, deps.clock);

  app.get('/expenses', async (c) => {
    const user = requireAuth(c);
    const raw = c.req.query();
    const query = ListExpensesQuery.parse({
      month: raw.month,
      from: raw.from,
      to: raw.to,
      category: raw.category,
      includeDeleted: parseIncludeDeleted(raw.includeDeleted),
      cursor: raw.cursor,
    });
    const body: ListExpensesResponseT = await service.list(user.id, user.defaultCurrency, query);
    return c.json(body);
  });

  app.post('/expenses', async (c) => {
    const user = requireAuth(c);
    const input = CreateExpenseRequest.parse(await c.req.json());
    const { expense, created } = await service.create(user.id, user.defaultCurrency, input);
    deps.onWrite?.(user.id);
    return c.json({ expense }, created ? 201 : 200);
  });

  app.patch('/expenses/:id', async (c) => {
    const user = requireAuth(c);
    const input = PatchExpenseRequest.parse(await c.req.json());
    const expense = await service.patch(user.id, user.defaultCurrency, c.req.param('id'), input);
    deps.onWrite?.(user.id);
    return c.json({ expense });
  });

  app.delete('/expenses/:id', async (c) => {
    const user = requireAuth(c);
    await service.remove(user.id, c.req.param('id'));
    deps.onWrite?.(user.id);
    return c.body(null, 204);
  });

  app.post('/expenses/:id/restore', async (c) => {
    const user = requireAuth(c);
    const expense = await service.restore(user.id, c.req.param('id'));
    deps.onWrite?.(user.id);
    return c.json({ expense });
  });

  return app;
}
