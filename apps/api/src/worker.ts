import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { parseBindings } from './env.js';

// Stage 2 entry point (Cloudflare Workers). Same app object as node.ts, different adapter.
// Hyperdrive and KV bindings are wired in Phase 6; Phase 0 only proves the bundle builds.
let app: ReturnType<typeof createApp> | undefined;

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    // Bindings are fixed per isolate, so validating and building once is safe.
    app ??= createApp({ version: pkg.version, sha: parseBindings(env).GIT_SHA });
    return app.fetch(request);
  },
};
