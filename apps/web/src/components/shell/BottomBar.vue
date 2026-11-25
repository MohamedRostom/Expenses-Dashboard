<script setup lang="ts">
import NavItems from './NavItems.vue';
</script>

<template>
  <div class="desk-bottom-bar surface surface-strong" data-testid="bottom-bar">
    <NavItems>
      <template #middle>
        <!-- Plain <a>: Month already owns /add as the current item (isCurrent), so Add never marks itself. -->
        <RouterLink v-slot="{ href, navigate }" to="/add" custom>
          <a :href="href" class="bottom-add" @click="navigate">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span class="nav-label">Add</span>
          </a>
        </RouterLink>
      </template>
    </NavItems>
  </div>
</template>

<style scoped>
/* Floating pill bar below 1024px; the sidebar takes over from there. */
@media (max-width: 1023px) {
  .desk-bottom-bar {
    position: fixed;
    z-index: 10;
    left: 50%;
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    box-sizing: border-box;
    width: calc(100% - 2 * var(--space-4));
    max-width: 24rem;
    padding: var(--space-2);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-overlay);
  }
}
@media (min-width: 1024px) {
  .desk-bottom-bar {
    display: none;
  }
}
/* The centre Add: the one filled control in the bar, a labelled link as tall as a nav item. */
.bottom-add {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: var(--target-min);
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-fg);
  font-size: var(--text-xs);
  font-weight: 600;
  text-decoration: none;
  touch-action: manipulation;
}
.bottom-add svg {
  width: var(--space-5);
  height: var(--space-5);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.bottom-add:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
</style>
