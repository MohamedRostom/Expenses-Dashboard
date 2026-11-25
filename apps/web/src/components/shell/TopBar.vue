<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { titleFor } from './navItems.js';

const route = useRoute();
const title = computed(() => titleFor(route.path));
</script>

<template>
  <!-- The title is the page's one h1; a screen teleports its controls into #top-bar-actions. -->
  <header class="desk-topbar surface surface-strong" data-testid="top-bar">
    <h1 class="top-title">{{ title }}</h1>
    <div id="top-bar-actions" class="top-actions"></div>
  </header>
</template>

<style scoped>
.desk-topbar {
  position: sticky;
  z-index: 9;
  top: var(--space-4);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  margin: var(--space-4) var(--space-4) 0;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-5);
}
.top-title {
  display: flex;
  align-items: center;
  /* Button height, so the bar is as tall on every page as on Month (title, switcher and Add). */
  min-block-size: var(--target-min);
  margin: 0;
  font-size: var(--text-md);
  line-height: var(--leading-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}
/* Actions sit at the end; when the bar wraps they take their own row, still right-aligned. */
.top-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-inline-start: auto;
  min-width: 0;
}
.top-actions:empty {
  display: none;
}
@media (min-width: 1024px) {
  .desk-topbar {
    margin-inline: var(--space-8) var(--space-8);
  }
}
</style>
