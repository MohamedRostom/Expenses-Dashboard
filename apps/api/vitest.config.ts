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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // node.ts only wires the server and is exercised by e2e-ci against the real container.
      exclude: ['src/node.ts'],
      thresholds: { lines: 85 },
    },
  },
});
