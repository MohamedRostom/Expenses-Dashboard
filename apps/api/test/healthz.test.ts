import { HealthResponse } from '@desk/contracts';
import { createApp } from '../src/app.js';
import { testDeps } from './support/test-deps.js';

describe('GET /healthz', () => {
  it('reports version and git sha in the shared contract shape', async () => {
    const app = createApp({ ...testDeps(), build: { version: '1.2.3', sha: 'abc1234' } });
    const res = await app.request('/healthz');

    expect(res.status).toBe(200);
    const body = HealthResponse.parse(await res.json());
    expect(body).toEqual({ status: 'ok', version: '1.2.3', sha: 'abc1234' });
  });
});
