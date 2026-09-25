<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Toast } from '@desk/ui';
import FeedbackWidget from './components/FeedbackWidget.vue';
import { useSessionStore } from './stores/session.js';
import { applyTheme } from './views/theme.js';

const route = useRoute();
const session = useSessionStore();
// Important-list fix: the saved theme used to apply only once SettingsView happened to mount —
// every other screen showed the default light/dark-by-OS look regardless of the user's choice.
watch(
  () => session.user?.theme,
  (theme) => applyTheme(theme ?? 'system'),
  { immediate: true },
);
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
    <RouterLink :to="{ name: 'import' }">Import</RouterLink>
    <RouterLink :to="{ name: 'bin' }">Bin</RouterLink>
    <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>
    <RouterLink :to="{ name: 'settings-connectors' }">Connectors</RouterLink>
    <button type="button" class="desk-nav-signout" @click="session.logout()">Sign out</button>
  </nav>
  <RouterView />
  <FeedbackWidget />
  <Toast />
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
  /* T097 covered MonthView/ExpenseForm/etc at 360px but not this nav — 7 links + Sign out never
   * fit a 390px viewport in one row (FR-019/Story 7: every screen usable at phone width).
   * flex-wrap keeps every link reachable without introducing a scroll container or a JS-driven
   * menu for what a CSS property already solves. */
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
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
.desk-nav-signout {
  margin-left: auto;
  background: none;
  border: none;
  font: inherit;
  color: var(--color-fg);
  opacity: 0.75;
  cursor: pointer;
  padding: 0;
}
.desk-nav-signout:hover {
  opacity: 1;
  color: var(--color-accent);
}
</style>
