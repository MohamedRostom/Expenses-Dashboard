import { Hono } from 'hono';
import { ResolveBody, SearchQuery, type CandidatesResponseT } from '@desk/contracts';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/api-error.js';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import type { createPlacesService } from '../services/places.js';

/** contracts/api.md: bad place input is 422, not the app-wide 400 for ZodError. */
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const details = Object.fromEntries(
    r.error.issues.map((i) => [i.path.join('.') || '(root)', i.message]),
  );
  throw new ApiError('validation_failed', 'Validation failed', 422, details);
}

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
