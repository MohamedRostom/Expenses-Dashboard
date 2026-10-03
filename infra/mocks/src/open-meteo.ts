import { Hono } from 'hono';

/** Spec 003: Open-Meteo mock; routes arrive with the OpenMeteoFake. */
export function createOpenMeteoMockApp(): Hono {
  return new Hono();
}
