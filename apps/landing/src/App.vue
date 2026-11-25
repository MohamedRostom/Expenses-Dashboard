<script setup lang="ts">
import { BackgroundMotion } from '@desk/ui';

// Always mounted: the warm ground is part of the look (ADR-0008). Only the moving preset sits
// behind the build flag (FR-021): vite.config.ts writes <html data-motion> as "particles" with the
// flag on and "none" (ground only) without it.
</script>

<template>
  <BackgroundMotion />
  <router-view />
</template>

<style>
/* Each page's own .page/.privacy/.terms container sets its own themed background, but nothing
 * set the body's — so anywhere narrower/shorter than that centered column (the side gutters at
 * wide viewports, or below the fold) stayed the browser-default white in dark mode. */
body {
  margin: 0;
  background: var(--color-bg);
}
</style>
