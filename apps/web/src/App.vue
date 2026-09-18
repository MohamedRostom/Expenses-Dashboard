<script setup lang="ts">
import FeedbackWidget from './components/FeedbackWidget.vue';
</script>

<template>
  <RouterView />
  <FeedbackWidget />
</template>

<style>
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
}
</style>
