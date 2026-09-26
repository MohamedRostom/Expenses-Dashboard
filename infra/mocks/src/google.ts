import { Hono } from 'hono';

export function createGoogleMockApp(): Hono {
  const app = new Hono();

  // T004: Google Calendar and Gmail mocks arrive with their phases
  return app;
}
