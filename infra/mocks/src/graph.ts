import { Hono } from 'hono';

export function createGraphMockApp(): Hono {
  const app = new Hono();

  // T004: Microsoft Graph mocks (Outlook Calendar and Mail) arrive with their phases
  return app;
}
