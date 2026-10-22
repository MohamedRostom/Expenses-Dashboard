import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // worker.ts imports the Workers-only module; Node tests get a stub that refuses to dial.
    alias: {
      'cloudflare:sockets': new URL('./test/stubs/cloudflare-sockets.ts', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Each file starts its own Postgres container; uncapped on a 12-core host that is ~11 at once,
    // which exhausts Docker Desktop's VM and surfaces as CONNECT_TIMEOUT. CI runners have 4 cores anyway.
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // node.ts only wires the server and is exercised by e2e-ci against the real container.
      exclude: ['src/node.ts'],
      thresholds: { lines: 85 },
    },
  },
});
