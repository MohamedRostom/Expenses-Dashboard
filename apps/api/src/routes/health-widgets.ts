import { Hono } from 'hono';
import type { Db } from '@desk/db';
import { sourceStatus } from '../services/source-usage.js';

/** GET /healthz/widgets — operator probe, no session, body is only { status }. */
export function createHealthWidgetsRoutes(db: Db, clock: { now(): Date }) {
  const app = new Hono();
  app.get('/healthz/widgets', async (c) => {
    const status = await sourceStatus(db, clock.now());
    return c.json({ status }, status === 'ok' ? 200 : 503);
  });
  return app;
}
