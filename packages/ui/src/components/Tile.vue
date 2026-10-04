<script setup lang="ts">
/** One primary figure with a label and an optional note. Presentational: callers own the data. */
import Skeleton from './Skeleton.vue';

defineProps<{
  label: string;
  /** Pre-formatted figure; when absent the default slot (e.g. an error) is shown. */
  value?: string | undefined;
  note?: string | undefined;
  loading?: boolean;
  variant?: 'default' | 'critical';
}>();
</script>

<template>
  <div class="desk-forecast-tile">
    <Skeleton v-if="loading" height="4rem" />
    <template v-else-if="value !== undefined">
      <!-- The figure comes first in the text flow; the label is placed above it by order. -->
      <span :class="['desk-tile-value', { 'desk-tile-value--critical': variant === 'critical' }]">{{
        value
      }}</span>
      <span class="desk-tile-label">{{ label }}</span>
      <p v-if="note" class="desk-forecast-basis">{{ note }}</p>
    </template>
    <slot v-else />
  </div>
</template>

<style scoped>
.desk-forecast-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  max-width: 20rem;
}
.desk-tile-label {
  order: -1;
  font-size: 0.8rem;
  opacity: 0.7;
}
.desk-tile-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 1.25rem;
}
.desk-tile-value--critical {
  color: var(--color-critical);
}
.desk-forecast-basis {
  font-size: 0.75rem;
  opacity: 0.7;
  margin: 0;
}
</style>
