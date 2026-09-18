import { HealthResponse } from '@desk/contracts';

// The Worker entry point caches its app per isolate, so each case loads a fresh module.
async function loadWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

// T117: worker.ts now requires real Hyperdrive/KV bindings to boot (parseWorkersBindings).
// These are fakes standing in for the real Cloudflare-provided objects — connectionString
// only needs to be a syntactically valid postgres URL, createDb() is never actually called
// against it in these two healthz-only cases (db.execute would fail against a fake host, but
// neither test hits a route that touches the db).
const fakeWorkersBindings = {
  HYPERDRIVE: { connectionString: 'postgres://fake:fake@localhost:5432/fake' },
  SESSIONS_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
};

describe('worker entry point', () => {
  it('serves /healthz and falls back to an unknown sha when the binding is absent', async () => {
    const worker = await loadWorker();
    const res = await worker.fetch(new Request('http://desk.test/healthz'), fakeWorkersBindings);
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json()).sha).toBe('unknown');
  });

  it('reports the GIT_SHA binding', async () => {
    const worker = await loadWorker();
    const res = await worker.fetch(new Request('http://desk.test/healthz'), {
      ...fakeWorkersBindings,
      GIT_SHA: 'abc1234',
    });
    expect(HealthResponse.parse(await res.json()).sha).toBe('abc1234');
  });

  it('refuses to serve when a binding is invalid', async () => {
    const worker = await loadWorker();
    await expect(
      worker.fetch(new Request('http://desk.test/healthz'), {
        ...fakeWorkersBindings,
        GIT_SHA: 42,
      } as never),
    ).rejects.toThrow(/GIT_SHA/);
  });

  it('refuses to serve when the Hyperdrive binding is missing', async () => {
    const worker = await loadWorker();
    await expect(
      worker.fetch(new Request('http://desk.test/healthz'), {
        SESSIONS_KV: fakeWorkersBindings.SESSIONS_KV,
      } as never),
    ).rejects.toThrow(/HYPERDRIVE/);
  });
});
