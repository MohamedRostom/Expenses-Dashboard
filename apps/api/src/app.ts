import { Hono } from 'hono';
import type { HealthResponseT } from '@desk/contracts';

export type BuildInfo = { version: string; sha: string };

/** The Desk API. Runtime-agnostic: node.ts and worker.ts wrap it with their adapters. */
export function createApp(build: BuildInfo) {
  const app = new Hono();

  app.get('/healthz', (c) => {
    const body: HealthResponseT = { status: 'ok', version: build.version, sha: build.sha };
    return c.json(body);
  });

  return app;
}
