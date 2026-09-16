import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points only wire adapters; they are exercised by e2e-ci, not unit tests.
      exclude: ['src/node.ts', 'src/worker.ts'],
      thresholds: { lines: 85 },
    },
  },
});
