import { Hono } from 'hono';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errors.js';
import { ApiError } from '../../src/lib/api-error.js';

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/api-error', () => {
    throw new ApiError('not_found', 'Expense not found', 404);
  });
  app.get('/zod-error', () => {
    z.object({ amount: z.number() }).parse({ amount: 'not a number' });
    return new Response();
  });
  app.get('/boom', () => {
    throw new Error('leaky internal detail: db password xyz');
  });
  return app;
}

describe('errorHandler', () => {
  it('serialises a thrown ApiError with its code, message and status', async () => {
    const res = await buildApp().request('/api-error');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Expense not found' },
    });
  });

  it('maps a ZodError to validation_failed with per-field details', async () => {
    const res = await buildApp().request('/zod-error');
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: Record<string, unknown> };
    };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toHaveProperty('amount');
  });

  it('maps an unknown thrown error to a generic 500 with no leaked internals', async () => {
    const res = await buildApp().request('/boom');
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: Record<string, unknown> };
    };
    expect(JSON.stringify(body)).not.toContain('db password');
  });
});
