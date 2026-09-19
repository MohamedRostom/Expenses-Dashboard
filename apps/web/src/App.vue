<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import FeedbackWidget from './components/FeedbackWidget.vue';
import { useSessionStore } from './stores/session.js';

const route = useRoute();
const session = useSessionStore();
// Signed-in app screens only: auth pages and the onboarding wizard stay chrome-free.
const showNav = computed(
  () => !!session.user && !!route.meta.requiresAuth && route.name !== 'onboarding',
);
</script>

<template>
  <nav v-if="showNav" class="desk-nav" aria-label="Main">
    <RouterLink :to="{ name: 'home' }">Month</RouterLink>
    <RouterLink :to="{ name: 'year' }">Year</RouterLink>
    <RouterLink :to="{ name: 'categories' }">Categories</RouterLink>
    <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>
  </nav>
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
.desk-nav {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  font-family: var(--font-sans);
  font-size: 0.9rem;
}
.desk-nav a {
  color: var(--color-fg);
  text-decoration: none;
  opacity: 0.75;
}
.desk-nav a:hover,
.desk-nav a.router-link-active {
  opacity: 1;
  color: var(--color-accent);
}
</style>
