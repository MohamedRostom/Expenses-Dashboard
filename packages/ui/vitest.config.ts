import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Default node environment (tokens/palette tests read files via import.meta.url);
// component tests opt in with a `// @vitest-environment jsdom` first line.
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'node',
    css: true,
  },
});
