<script setup lang="ts">
import { useFlagsStore } from '../../stores/flags.js';
import { useFeedback } from '../../composables/useFeedback.js';
import DeskLogo from '../DeskLogo.vue';
import NavItems from './NavItems.vue';

defineEmits<{ signOut: [] }>();
const flags = useFlagsStore();
const { openFeedback } = useFeedback();
</script>

<template>
  <aside class="desk-sidebar surface surface-strong" data-testid="sidebar">
    <DeskLogo class="side-brand" />
    <NavItems />
    <div
      v-if="flags.isOn('appearance.motion') || flags.isOn('appearance.accent')"
      class="side-personalise"
    >
      <RouterLink v-slot="{ href, navigate }" to="/settings#appearance" custom>
        <a :href="href" class="side-btn" @click="navigate">Personalise</a>
      </RouterLink>
    </div>
    <div class="side-foot">
      <p class="side-tagline">Your money, at a glance.</p>
      <button type="button" class="side-btn" data-testid="feedback" @click="openFeedback">
        Feedback
      </button>
      <button type="button" class="side-btn" data-testid="sign-out" @click="$emit('signOut')">
        Sign out
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* Hidden below 1024px, where the bottom bar stands in (Sign out lives in this sidebar and in Settings only). */
.desk-sidebar {
  display: none;
}
@media (min-width: 1024px) {
  .desk-sidebar {
    position: fixed;
    z-index: 10;
    top: var(--space-4);
    bottom: var(--space-4);
    left: var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    width: var(--shell-side-w);
    padding: var(--space-5) var(--space-3);
    overflow-y: auto;
  }
}
.side-brand {
  padding-inline: var(--space-3);
}
.side-personalise {
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-3) 0;
  border-top: 1px solid color-mix(in srgb, var(--color-fg) 28%, transparent);
}
.side-foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: auto;
  padding-inline: var(--space-3);
}
.side-tagline {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
}
.side-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--target-min);
  padding: 0 var(--space-5);
  border: 1px solid color-mix(in srgb, var(--color-fg) 28%, transparent);
  border-radius: var(--radius-pill);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.side-btn:hover {
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.side-btn:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .side-btn {
    transition: none;
  }
}
</style>
