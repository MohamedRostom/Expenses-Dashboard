import pkg from '../package.json' with { type: 'json' };
import { createApp, type AppDeps } from './app.js';
import { parseBindings } from './env.js';

// Stage 2 entry point (Cloudflare Workers). Same app object as node.ts, different adapter.
// Hyperdrive/KV-backed deps are wired in Phase 6; Phase 0/1 only prove the bundle builds, so
// every dep below throws lazily if a route actually reaches it (ponytail: same pattern as
// apps/api/src/jobs/tick.ts's todoDb — no Workers wiring to build until Phase 6 needs it).
function notWired(name: string): never {
  throw new Error(`worker.ts: ${name} not wired until Phase 6`);
}

function buildDeps(gitSha: string): AppDeps {
  const lazy = new Proxy({}, { get: (_t, prop) => notWired(String(prop)) });
  return {
    db: lazy as AppDeps['db'],
    hasher: lazy as AppDeps['hasher'],
    sessions: lazy as AppDeps['sessions'],
    limiter: lazy as AppDeps['limiter'],
    mailer: lazy as AppDeps['mailer'],
    secretBox: lazy as AppDeps['secretBox'],
    rates: undefined,
    jobs: undefined,
    clock: { now: () => new Date() },
    build: { version: pkg.version, sha: gitSha },
  };
}

let app: ReturnType<typeof createApp> | undefined;

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    // Bindings are fixed per isolate, so validating and building once is safe.
    app ??= createApp(buildDeps(parseBindings(env).GIT_SHA));
    return app.fetch(request);
  },
};
