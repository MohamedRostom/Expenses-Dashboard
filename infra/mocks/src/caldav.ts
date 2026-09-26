import { Hono } from 'hono';

export function createCalDavMockApp(): Hono {
  const app = new Hono();

  // T004: CalDAV protocol mocks arrive with their phases
  return app;
}
