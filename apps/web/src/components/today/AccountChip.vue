<script setup lang="ts">
import { computed } from 'vue';
import type { TodayAccountT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';

interface Props {
  account: TodayAccountT;
}

const props = defineProps<Props>();
const today = useTodayStore();

// Accounts store a palette name ('teal'); a ready-made CSS colour (the catalogue's var()) passes through.
const chipColour = computed(() =>
  /^[a-z]+$/.test(props.account.colour)
    ? `var(--palette-${props.account.colour})`
    : props.account.colour,
);

const isActive = computed(() => today.filterAccountId === props.account.id);

function toggle() {
  today.filterAccountId = isActive.value ? null : props.account.id;
}
</script>

<template>
  <button
    type="button"
    class="account-chip"
    :aria-pressed="isActive"
    :style="{ '--chip-color': chipColour }"
    @click="toggle"
  >
    <span class="chip-color"></span>
    <span class="chip-label">{{ account.label }}</span>
  </button>
</template>

<style scoped>
/* A filter pill on palette colours only. Pressed = a 2px Board Ink edge and heavier label, never a
   colour fill, so text keeps its contrast on every palette colour. */
.account-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-fg);
  transition:
    background var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.account-chip:hover {
  background: var(--color-surface);
}
.account-chip:active {
  transform: translateY(1px);
}
.account-chip:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.account-chip[aria-pressed='true'] {
  border: 2px solid var(--color-fg);
  font-weight: 600;
}
.chip-color {
  flex: none;
  width: var(--space-3);
  height: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--chip-color);
}
@media (min-width: 1024px) {
  .account-chip {
    min-height: 24px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .account-chip {
    transition: none;
  }
}
</style>
