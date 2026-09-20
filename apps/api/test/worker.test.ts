import { HealthResponse } from '@desk/contracts';
import { JobRunner } from '../src/jobs/runner.js';
import type { Db as QueryDb } from '../src/adapters/rate-limiter.js';

// The Worker entry point caches its app per isolate, so each case loads a fresh module.
async function loadWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

async function loadBuildDeps() {
  vi.resetModules();
  return (await import('../src/worker.js')).buildDeps;
}

/** Never actually queried in these tests — buildDeps only stores it on the JobRunner/limiter. */
const noopQueryDb: QueryDb = { query: async () => ({ rows: [] }) };

// T117: worker.ts now requires real Hyperdrive/KV bindings to boot (parseWorkersBindings).
// These are fakes standing in for the real Cloudflare-provided objects — connectionString
// only needs to be a syntactically valid postgres URL, createDb() is never actually called
// against it in these two healthz-only cases (db.execute would fail against a fake host, but
// neither test hits a route that touches the db).
const fakeWorkersBindings = {
  HYPERDRIVE: { connectionString: 'postgres://fake:fake@localhost:5432/fake' },
  SESSIONS_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
  APP_ORIGIN: 'https://app.test',
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
        APP_ORIGIN: fakeWorkersBindings.APP_ORIGIN,
      } as never),
    ).rejects.toThrow(/HYPERDRIVE/);
  });
});

// T125: hasher/limiter/mailer/secretBox/rates were lazy Proxies that threw "not wired yet" on
// every use, so every route touching auth, expense conversion, capture rotation or mail was
// broken on the Worker runtime despite T117 being marked done. This proves each adapter is now
// real (or, for the two that need a secret Rostom hasn't provisioned yet, fails with a clear
// message instead of silently doing nothing).
describe('worker adapter wiring (T125)', () => {
  const bindings = {
    HYPERDRIVE: { connectionString: 'postgres://fake:fake@localhost:5432/fake' },
    SESSIONS_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
    APP_ORIGIN: 'https://app.test',
    GIT_SHA: 'abc1234',
  };
  const secretBoxKey = Buffer.alloc(32, 7).toString('base64');

  it('wires a real password hasher, rate limiter and rates provider unconditionally', async () => {
    const buildDeps = await loadBuildDeps();
    const deps = buildDeps(bindings, new JobRunner(noopQueryDb), noopQueryDb);

    await expect(deps.hasher.verify('x', await deps.hasher.hash('x'))).resolves.toBe(true);
    expect(deps.limiter.constructor.name).toBe('PgRateLimiter');
    expect(deps.rates.constructor.name).toBe('FrankfurterRates');
  });

  it('falls back to a clear error for mailer/secretBox when their secrets are unset', async () => {
    const buildDeps = await loadBuildDeps();
    const deps = buildDeps(bindings, new JobRunner(noopQueryDb), noopQueryDb);

    // The Proxy's `get` trap throws on property access itself (before the call even happens),
    // so these throw synchronously rather than returning a rejected promise.
    expect(() => deps.mailer.send({ to: 'a@test', subject: 's', html: 'h' })).toThrow(
      /mailer not wired yet/,
    );
    expect(() => deps.secretBox.seal('secret')).toThrow(/secretBox not wired yet/);
  });

  it('wires a real mailer and secretBox once RESEND_API_KEY/SECRET_BOX_KEY are set', async () => {
    const buildDeps = await loadBuildDeps();
    const deps = buildDeps(
      { ...bindings, RESEND_API_KEY: 'test-key', SECRET_BOX_KEY: secretBoxKey },
      new JobRunner(noopQueryDb),
      noopQueryDb,
    );

    expect(deps.mailer.constructor.name).toBe('ResendMailer');
    await expect(deps.secretBox.open(await deps.secretBox.seal('secret'))).resolves.toBe('secret');
  });
});
