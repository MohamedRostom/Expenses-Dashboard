import { HealthResponse } from '@desk/contracts';
import { createApp } from '../src/app.js';
import { testDeps } from './support/test-deps.js';

describe('GET /healthz', () => {
  it('reports version and git sha in the shared contract shape', async () => {
    const app = createApp({ ...testDeps(), build: { version: '1.2.3', sha: 'abc1234' } });
    const res = await app.request('/healthz');

    expect(res.status).toBe(200);
    const body = HealthResponse.parse(await res.json());
    expect(body).toEqual({ status: 'ok', version: '1.2.3', sha: 'abc1234', db: 'ok' });
  });

  // T109: db: 'ok' | 'degraded' for the uptime monitor (contracts/api.md) — 200 either way,
  // healthz never hard-fails on a slow/broken DB.
  it('reports db: degraded (still 200) when the trivial query fails', async () => {
    const failingDb = { execute: async () => Promise.reject(new Error('connection refused')) };
    const app = createApp({
      ...testDeps({ db: failingDb as unknown as ReturnType<typeof testDeps>['db'] }),
      build: { version: '1.2.3', sha: 'abc1234' },
    });
    const res = await app.request('/healthz');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { db: string };
    expect(body.db).toBe('degraded');
  });
});
