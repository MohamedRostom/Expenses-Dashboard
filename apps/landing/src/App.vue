<template>
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
