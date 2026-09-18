import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  // Emits nonce="%NONCE%" on the module script tag; node.ts substitutes the real per-request
  // nonce when serving index.html (research.md R11).
  html: {
    cspNonce: '%NONCE%',
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/healthz': process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
});
