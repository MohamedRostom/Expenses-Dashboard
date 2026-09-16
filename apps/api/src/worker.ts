import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';

// Stage 2 entry point (Cloudflare Workers). Same app object as node.ts, different adapter.
// Hyperdrive and KV bindings are wired in Phase 6; Phase 0 only proves the bundle builds.
type Bindings = { GIT_SHA?: string };

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Bindings): Response | Promise<Response> {
    app ??= createApp({ version: pkg.version, sha: env.GIT_SHA ?? 'unknown' });
    return app.fetch(request);
  },
};
