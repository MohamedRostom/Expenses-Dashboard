<script setup lang="ts">
// The "Main" navigation, rendered twice (sidebar and bottom bar); CSS shows one per viewport.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useFlagsStore } from '../../stores/flags.js';
import { NAV_ITEMS, isCurrent } from './navItems.js';

const route = useRoute();
const flags = useFlagsStore();
const items = computed(() => NAV_ITEMS.filter((i) => !i.flag || flags.isOn(i.flag)));
// The optional "middle" slot (the bottom bar's Add) always follows Year, whichever flags are on.
const middle = computed(() => items.value.findIndex((i) => i.id === 'year') + 1);
</script>

<template>
  <nav class="nav-items" aria-label="Main">
    <template v-for="(i, idx) in items" :key="i.id">
      <slot v-if="idx === middle" name="middle" />
      <RouterLink v-slot="{ href, navigate }" :to="i.to" custom>
        <a
          :href="href"
          class="nav-item"
          :aria-current="isCurrent(i.id, route.path) ? 'page' : undefined"
          @click="navigate"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="i.icon" /></svg>
          <span class="nav-label">{{ i.label }}</span>
        </a>
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.nav-items {
  display: flex;
  gap: var(--space-1);
}
.nav-item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: 52px;
  border-radius: var(--radius-xl);
  color: var(--color-fg-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  text-decoration: none;
  touch-action: manipulation;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.nav-item svg {
  width: var(--space-6);
  height: var(--space-6);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.nav-item:hover {
  color: var(--color-fg);
  background: color-mix(in srgb, var(--color-fg) 8%, transparent);
}
/* The selected item sits on --nav-colour (a later phase sets it, with --nav-colour-fg); text is
 * foreground ink, never the accent. */
.nav-item[aria-current='page'] {
  color: var(--nav-colour-fg, var(--color-fg));
  background: var(--nav-colour, color-mix(in srgb, var(--color-fg) 12%, transparent));
}
/* Forced colours drop the background, so mark the selected item with an outline. */
@media (forced-colors: active) {
  .nav-item[aria-current='page'] {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
.nav-item:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
@media (min-width: 1024px) {
  .nav-items {
    flex-direction: column;
  }
  .nav-item {
    flex: none;
    flex-direction: row;
    justify-content: flex-start;
    gap: var(--space-3);
    min-height: var(--target-min);
    padding-inline: var(--space-3);
    border-radius: var(--radius-field);
    font-size: var(--text-sm);
  }
}
@media (prefers-reduced-motion: reduce) {
  .nav-item {
    transition: none;
  }
}
</style>
