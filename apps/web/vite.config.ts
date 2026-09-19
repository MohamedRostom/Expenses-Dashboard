import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    // research.md R18: generateSW, navigation fallback for the SPA, a font runtime-cache rule
    // (self-hosted IBM Plex isn't wired up yet — this targets Google Fonts as a placeholder for
    // whichever host actually serves it once typography lands), manifest with an /add shortcut
    // for the 15-second phone-add flow. Icons are solid-color placeholders (apps/web/public/icons) —
    // swap for real brand assets before shipping.
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallback: '/index.html',
        // C9: same API prefixes as the dev proxy list below — the SW must never serve the SPA
        // shell for these (OAuth redirects, capture webhooks, etc. need the real response).
        navigateFallbackDenylist: [
          /^\/auth/,
          /^\/capture/,
          /^\/categories/,
          /^\/currencies/,
          /^\/expenses/,
          /^\/feedback/,
          /^\/healthz/,
          /^\/imports/,
          /^\/jobs/,
          /^\/me/,
          /^\/notion/,
          /^\/summary/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Desk',
        short_name: 'Desk',
        description: 'Expenses dashboard',
        theme_color: '#1f6e5a',
        background_color: '#f2f4f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        shortcuts: [
          {
            name: 'Add expense',
            url: '/add',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
  // Emits nonce="%NONCE%" on the module script tag; node.ts substitutes the real per-request
  // nonce when serving index.html (research.md R11).
  html: {
    cspNonce: '%NONCE%',
  },
  server: {
    port: 5173,
    strictPort: true,
    // Every API prefix the app calls (client.ts uses relative paths); anything else is a client route.
    proxy: Object.fromEntries(
      [
        '/auth',
        '/capture',
        '/categories',
        '/currencies',
        '/expenses',
        '/feedback',
        '/healthz',
        '/imports',
        '/jobs',
        '/me',
        '/notion',
        '/summary',
      ].map((p) => [p, process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000']),
    ),
  },
});
