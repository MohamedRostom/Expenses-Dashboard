import { Hono } from 'hono';
import { hashUserId, type LogEvent, type Logger } from '../../src/adapters/logger.js';
import { requestLogger, type RequestLoggerVariables } from '../../src/middleware/request-logger.js';

function capturingLogger(): { logger: Logger; events: LogEvent[] } {
  const events: LogEvent[] = [];
  return { logger: { log: (e) => events.push(e) }, events };
}

describe('requestLogger middleware', () => {
  it('logs one parseable JSON line per request with requestId, route, status, durationMs and no raw user id', async () => {
    const { logger, events } = capturingLogger();
    const app = new Hono<{ Variables: RequestLoggerVariables }>();
    app.use('*', requestLogger(logger));
    app.get('/expenses/:id', (c) => {
      c.set('user', { id: 'user-123' });
      return c.json({ ok: true });
    });

    const res = await app.request('/expenses/42');
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(typeof event.requestId).toBe('string');
    expect(event.route).toBe('/expenses/:id');
    expect(event.status).toBe(200);
    expect(typeof event.durationMs).toBe('number');
    expect(event.hashedUserId).toBe(await hashUserId('user-123'));

    // Serializes to exactly one JSON line, and never contains the raw user id.
    const line = JSON.stringify(event);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toContain('user-123');
  });

  it('logs hashedUserId: null when no user is set on the context', async () => {
    const { logger, events } = capturingLogger();
    const app = new Hono<{ Variables: RequestLoggerVariables }>();
    app.use('*', requestLogger(logger));
    app.get('/healthz', (c) => c.json({ ok: true }));

    await app.request('/healthz');
    expect(events[0]!.hashedUserId).toBeNull();
  });
});
