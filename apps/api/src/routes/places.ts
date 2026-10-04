import { Hono } from 'hono';
import { ResolveBody, SearchQuery, type CandidatesResponseT } from '@desk/contracts';
import { parse } from '../lib/parse.js';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import type { createPlacesService } from '../services/places.js';

/** GET /places/search, POST /places/resolve. Coordinates and queries are never logged. */
export function createPlacesRoutes(service: ReturnType<typeof createPlacesService>) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/places/search', async (c) => {
    const user = requireAuth(c);
    const { q } = parse(SearchQuery, { q: c.req.query('q') ?? '' });
    const body: CandidatesResponseT = { candidates: await service.search(user, q) };
    return c.json(body);
  });

  app.post('/places/resolve', async (c) => {
    const user = requireAuth(c);
    const { lat, lon } = parse(ResolveBody, await c.req.json());
    const body: CandidatesResponseT = await service.resolve(user, lat, lon);
    return c.json(body);
  });

  return app;
}
