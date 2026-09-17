import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/healthz': process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
});
