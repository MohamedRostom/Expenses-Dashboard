import { Hono } from 'hono';
import { GenericWebhookBody, type GenericWebhookResponseT } from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { ApiError } from '../lib/api-error.js';
import type { CaptureService } from '../services/capture.js';

const MAX_BODY_BYTES = 4096;

/** POST /hooks/generic/:token — unauthenticated; the token in the path IS the credential.
 * Exempt from session/CSRF (see app.ts / middleware/csrf.ts). */
export function createHooksRoutes(captureService: CaptureService) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.post('/hooks/generic/:token', async (c) => {
    const token = c.req.param('token');
    const text = await c.req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      throw new ApiError('validation_failed', 'Body too large', 400);
    }

    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      throw new ApiError('validation_failed', 'Invalid JSON body', 400);
    }
    const body = GenericWebhookBody.parse(json);

    const result = await captureService.handleWebhook(token, body);
    const respBody: GenericWebhookResponseT = {
      expenseId: result.expenseId,
      duplicate: result.duplicate,
    };
    return c.json(respBody, result.status);
  });

  return app;
}
