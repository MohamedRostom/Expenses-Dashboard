import { Hono } from 'hono';
import type { RatesProvider } from '@desk/connectors/rates';
import type { Db } from '@desk/db';
import type { RatePreviewResponseT } from '@desk/contracts';
import { createRatesService } from '../services/rates.js';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';

/** GET /rates — conversion preview for the expense form. */
export function createRatesRoutes(db: Db, provider: RatesProvider) {
  const app = new Hono<{ Variables: AppVariables }>();
  const ratesService = createRatesService(db, provider);

  app.get('/rates', async (c) => {
    requireAuth(c);
    const date = c.req.query('date');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!date || !from || !to) {
      throw new ApiError('validation_failed', 'date, from and to are required', 400);
    }

    const outcome = await ratesService.getRate(date, from, to);
    const body: RatePreviewResponseT =
      'unsupported' in outcome
        ? { unsupported: true }
        : { rate: outcome.rate, rateDate: outcome.rateDate, source: outcome.source };
    return c.json(body);
  });

  return app;
}
