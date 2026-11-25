<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { START_LOCATION, useRoute, useRouter } from 'vue-router';
import { BackgroundMotion, Toast } from '@desk/ui';
import AppSidebar from './components/shell/AppSidebar.vue';
import BottomBar from './components/shell/BottomBar.vue';
import TopBar from './components/shell/TopBar.vue';
import FeedbackWidget from './components/FeedbackWidget.vue';
import AuthBackdrop from './components/AuthBackdrop.vue';
import BootError from './components/BootError.vue';
import { bootError } from './bootError.js';

const reloadApp = () => location.reload();
import { useSessionStore } from './stores/session.js';
import { useFlagsStore } from './stores/flags.js';
import { applyAccent, applyFreeColours, applyMotion, applyTheme } from './views/theme.js';

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
// ADR-0008 free colours: accent, ground tint and nav highlight. Signed out shows none (user is
// null). "Dark" is read from the effective theme, so the theme and the system scheme are inputs.
watch(
  () =>
    [
      session.user?.theme,
      session.user?.accentCustom,
      session.user?.groundTint,
      session.user?.navColour,
      !!session.user,
      flags.isOn('appearance.accent'),
      scheme.value,
    ] as const,
  () => applyFreeColours(session.user, flags.isOn('appearance.accent')),
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

// Keyboard and screen-reader users land on the new screen, not on the nav they just used: focus the
// main container after each route change, but not on the first load and not for hash or query-only
// changes (they would steal focus from anchor jumps). The skip link focuses it directly, so the
// router never sees a "#main" hash.
const mainEl = ref<HTMLElement | null>(null);
function skipToMain(e: Event) {
  e.preventDefault();
  mainEl.value?.focus();
}
const stopFocusHook = router.afterEach((to, from, failure) => {
  if (failure || from === START_LOCATION || to.path === from.path) return;
  // A screen that already moved focus into itself (a dialog, an autofocused field) keeps it.
  void nextTick(() => {
    const main = mainEl.value;
    const at = document.activeElement;
    if (main && !(at && at !== main && main.contains(at))) main.focus();
  });
});
onBeforeUnmount(stopFocusHook);
</script>

<template>
  <a v-if="showNav" href="#main" class="desk-skip-link" data-testid="skip-link" @click="skipToMain">
    Skip to content
  </a>
  <!-- Signed-out pages cycle their own backdrop (ADR-0007 amendment 2026-10-18); moving only
       while appearance.motion is on, a still scene otherwise. -->
  <AuthBackdrop v-if="onSignedOutPage" :animate="flags.isOn('appearance.motion')" />
  <BackgroundMotion v-else />
  <AppSidebar v-if="showNav" @sign-out="signOut" />
  <BottomBar v-if="showNav" />
  <!-- Every view renders its own <main>, so this is a plain focus target (no role), not a second
       landmark. Signed in it is the content frame: the sidebar / bottom-bar inset lives here, so
       screens add no page padding for the shell. -->
  <div
    id="main"
    ref="mainEl"
    tabindex="-1"
    data-testid="main-content"
    :class="{ 'desk-frame': showNav }"
  >
    <TopBar v-if="showNav" />
    <!-- A failed boot (session call down, no cached user) shows an error, not a blank page. -->
    <BootError
      v-if="bootError"
      v-bind="bootError.code ? { code: bootError.code } : {}"
      @retry="reloadApp"
    />
    <RouterView v-else />
  </div>
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
:root {
  --shell-side-w: 13rem;
}
/* Skip link: first focusable element, visible only on focus. */
.desk-skip-link {
  position: fixed;
  z-index: 300;
  top: var(--space-2);
  left: var(--space-2);
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  color: var(--color-fg);
  box-shadow: var(--shadow-overlay);
  font-weight: 600;
  transform: translateY(-200%);
}
.desk-skip-link:focus-visible {
  transform: none;
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
#main:focus {
  outline: none;
}
/* The shell's content inset (ADR-0008): room for the floating bottom bar and the safe area below
 * 1024px, for the sidebar from 1024px. Screens add no page padding for either. */
@media (max-width: 1023px) {
  .desk-frame {
    padding-bottom: calc(var(--space-24) + env(safe-area-inset-bottom));
  }
}
@media (min-width: 1024px) {
  .desk-frame {
    padding-left: calc(var(--shell-side-w) + var(--space-4));
  }
}
</style>
