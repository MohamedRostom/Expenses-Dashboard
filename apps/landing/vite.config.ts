import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Spec 006 FR-021: the flag is read at build time, so the attributes the motion layer's CSS keys
// on are written into the static HTML. Particles in Signal mint (light) and the fixed dark tint,
// as two :root rules (dark follows the OS, as the landing page has no theme switch). The hex is
// duplicated from @desk/contracts (MOTION_SWATCHES[0], MOTION_DARK_TINT) because the config
// loader cannot import that package's TS source; landing.build.test.ts asserts they match.
const MINT = '#7fd1a8';
const motionOn = process.env['VITE_APPEARANCE_MOTION'] === 'true';
const tintCss =
  `:root{--motion-tint:${MINT}}` +
  `@media (prefers-color-scheme:dark){:root{--motion-tint:${MINT}}}`;

export default defineConfig({
  plugins: [vue()],
  build: { outDir: process.env['LANDING_OUT_DIR'] ?? 'dist' },
  ssgOptions: {
    onPageRendered: (_route, html) =>
      motionOn
        ? html
            .replace('<html ', '<html data-motion="particles" ')
            .replace('</head>', `<style>${tintCss}</style></head>`)
        : html,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
