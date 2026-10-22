<script setup lang="ts">
import { BackgroundMotion } from '@desk/ui';

// Off unless the landing site is built with the flag on (FR-021); the html attributes the layer
// needs are written at build time in vite.config.ts.
const motion = import.meta.env.VITE_APPEARANCE_MOTION === 'true';
</script>

<template>
  <BackgroundMotion v-if="motion" />
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
