<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BackgroundMotion, Toast } from '@desk/ui';
import FeedbackWidget from './components/FeedbackWidget.vue';
import AuthBackdrop from './components/AuthBackdrop.vue';
import { useSessionStore } from './stores/session.js';
import { useFlagsStore } from './stores/flags.js';
import { applyAccent, applyMotion, applyTheme } from './views/theme.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
// The auth guard only runs on navigation, so clearing the session alone left the old screen up.
async function signOut() {
  await session.logout();
  await router.replace('/login');
}
const flags = useFlagsStore();
// Important-list fix: the saved theme used to apply only once SettingsView happened to mount —
// every other screen showed the default light/dark-by-OS look regardless of the user's choice.
watch(
  () => session.user?.theme,
  (theme) => applyTheme(theme ?? 'system'),
  { immediate: true },
);
// US5 (FR-019): the accent preset follows the account once the flag is known; flag off or signed
// out, no data-accent is set. Flags load after sign-in, so the flag is part of the watch.
watch(
  () => [session.user?.accent, flags.isOn('appearance.accent')] as const,
  ([accent, enabled]) => applyAccent(accent, enabled),
  { immediate: true },
);
// Spec 006: background motion state on <html>. Theme is applied first (applyMotion reads it), and
// the state is re-derived on theme, flag, prefs, tab visibility and system colour-scheme changes.
const hidden = ref(typeof document !== 'undefined' && document.visibilityState === 'hidden');
const onVisibility = () => (hidden.value = document.visibilityState === 'hidden');
const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const scheme = ref(0);
const onScheme = () => scheme.value++;
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  dark?.addEventListener?.('change', onScheme);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  dark?.removeEventListener?.('change', onScheme);
});
watch(
  () =>
    [
      session.user?.theme,
      session.user?.motionPreset,
      session.user?.motionColour,
      session.user?.panelsTranslucent,
      session.user?.motionPaused,
      flags.isOn('appearance.motion'),
      hidden.value,
      scheme.value,
    ] as const,
  () =>
    applyMotion(session.user ?? null, {
      enabled: flags.isOn('appearance.motion'),
      hidden: hidden.value,
    }),
  { immediate: true, flush: 'post' },
);
// Flags follow the auth state: public set signed out, full set signed in (the store dedupes).
watch(
  () => !!session.user,
  () => flags.load(),
  { immediate: true },
);
// Signed-in app screens only: auth pages and the onboarding wizard stay chrome-free.
const showNav = computed(
  () => !!session.user && !!route.meta.requiresAuth && route.name !== 'onboarding',
);

const SIGNED_OUT_PAGES = new Set(['login', 'register', 'verify', 'forgot', 'reset']);
const onSignedOutPage = computed(() => SIGNED_OUT_PAGES.has(String(route.name)));

// Show Today link only when the flag is on
const showTodayLink = computed(() => flags.isOn('panels.today'));
</script>

<template>
  <header v-if="showNav" class="desk-header">
    <nav class="desk-nav" aria-label="Main">
      <RouterLink :to="{ name: 'home' }">Month</RouterLink>
      <RouterLink :to="{ name: 'year' }">Year</RouterLink>
      <RouterLink v-if="showTodayLink" :to="{ name: 'today' }">Today</RouterLink>
      <RouterLink :to="{ name: 'categories' }">Categories</RouterLink>
      <RouterLink :to="{ name: 'import' }">Import</RouterLink>
      <RouterLink :to="{ name: 'bin' }">Bin</RouterLink>
      <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>
      <RouterLink :to="{ name: 'settings-connectors' }">Connectors</RouterLink>
      <button type="button" class="desk-nav-signout" @click="signOut">Sign out</button>
    </nav>
  </header>
  <!-- Signed-out pages cycle their own backdrop (ADR-0007 amendment 2026-10-18); moving only
       while appearance.motion is on, a still scene otherwise. -->
  <AuthBackdrop v-if="onSignedOutPage" :animate="flags.isOn('appearance.motion')" />
  <BackgroundMotion v-else />
  <RouterView />
  <!-- The dev-only catalogue and mock-ups (/__ui) show their own chrome only. -->
  <FeedbackWidget v-if="!route.path.startsWith('/__ui')" />
  <Toast />
</template>

<style>
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
}
/* The raised flap strip (DESIGN.md Layout, Navigation): text links in a wrapping row, the current
 * page marked by a 2px accent underline (the accent is never text colour), Sign out at the far end. */
.desk-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-raised);
}
.desk-nav {
  display: flex;
  /* T097: 7 links + Sign out never fit one 390px row; wrapping keeps every link reachable with no
   * scroll container or JS-driven menu. */
  flex-wrap: wrap;
  column-gap: var(--space-4);
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-1) var(--gutter);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}
.desk-nav a,
.desk-nav-signout {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  font: inherit;
  color: var(--color-fg-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.desk-nav a:hover,
.desk-nav-signout:hover {
  color: var(--color-fg);
}
.desk-nav a[aria-current='page'] {
  color: var(--color-fg);
  border-bottom-color: var(--color-accent);
}
.desk-nav a:focus-visible,
.desk-nav-signout:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-nav-signout {
  margin-left: auto;
}
@media (min-width: 768px) {
  .desk-nav {
    padding-inline: var(--gutter-fluid);
  }
}
@media (min-width: 1024px) {
  .desk-nav a,
  .desk-nav-signout {
    min-height: var(--space-10);
  }
}
@media (prefers-reduced-motion: reduce) {
  .desk-nav a,
  .desk-nav-signout {
    transition: none;
  }
}
</style>
