<script setup lang="ts">
import { computed } from 'vue';
import type { TodayAccountT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';

interface Props {
  account: TodayAccountT;
}

const props = defineProps<Props>();
const today = useTodayStore();

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
    :style="{ '--chip-color': account.colour }"
    @click="toggle"
  >
    <span class="chip-color"></span>
    <span class="chip-label">{{ account.label }}</span>
  </button>
</template>

<style scoped>
.account-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--color-bg-secondary, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  border-radius: 1rem;
  cursor: pointer;
  font: inherit;
  color: var(--color-fg);
  transition: all 0.2s;
}

.account-chip:hover {
  background: var(--color-bg-tertiary, rgba(0, 0, 0, 0.08));
}

.account-chip[aria-pressed='true'] {
  background: var(--chip-color);
  color: white;
  border-color: var(--chip-color);
}

.chip-color {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 0.5rem;
  background: var(--chip-color);
}

.account-chip[aria-pressed='true'] .chip-color {
  background: rgba(255, 255, 255, 0.8);
}

.chip-label {
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
