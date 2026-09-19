import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import type { ErrorEnvelopeT } from '@desk/contracts';
import { ApiError } from '../lib/api-error.js';

/** app.onError handler: maps ApiError, ZodError and unknown errors to the ErrorEnvelope shape. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    const body: ErrorEnvelopeT = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    return c.json(body, err.status as never);
  }

  if (err instanceof ZodError) {
    const details: Record<string, unknown> = {};
    for (const issue of err.issues) {
      details[issue.path.join('.') || '(root)'] = issue.message;
    }
    const body: ErrorEnvelopeT = {
      error: { code: 'validation_failed', message: 'Validation failed', details },
    };
    return c.json(body, 400);
  }

  // Unknown error: log server-side (request-logger covers status) with the real exception
  // attached to the context so request-logger can pass it to the Sentry wrapper as-is instead
  // of a synthetic Error with no stack — and leak nothing to the client.
  console.error(err);
  c.set('lastError', err instanceof Error ? err : new Error(String(err)));
  const body: ErrorEnvelopeT = {
    error: { code: 'internal', message: 'Internal server error' },
  };
  return c.json(body, 500);
};
