import { HealthResponse } from '@desk/contracts';

// The Worker entry point caches its app per isolate, so each case loads a fresh module.
async function loadWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

describe('worker entry point', () => {
  it('serves /healthz and falls back to an unknown sha when the binding is absent', async () => {
    const worker = await loadWorker();
    const res = await worker.fetch(new Request('http://desk.test/healthz'), {});
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json()).sha).toBe('unknown');
  });

  it('reports the GIT_SHA binding', async () => {
    const worker = await loadWorker();
    const res = await worker.fetch(new Request('http://desk.test/healthz'), { GIT_SHA: 'abc1234' });
    expect(HealthResponse.parse(await res.json()).sha).toBe('abc1234');
  });

  it('refuses to serve when a binding is invalid', async () => {
    const worker = await loadWorker();
    await expect(
      worker.fetch(new Request('http://desk.test/healthz'), { GIT_SHA: 42 } as never),
    ).rejects.toThrow(/GIT_SHA/);
  });
});
