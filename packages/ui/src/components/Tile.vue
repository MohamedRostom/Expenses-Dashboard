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
  /** The one Display-role figure on a screen (FR-011); `data-tile-primary` marks it. */
  primary?: boolean;
  /** `value` is words (e.g. "No budget set"), not a figure: sans face, secondary size, one line. */
  words?: boolean;
  /** Status words after the note, in the tone's colour (amber pending, red over). Always words. */
  status?: { text: string; tone: 'warn' | 'critical' }[];
}>();
</script>

<template>
  <div
    :class="[
      'desk-tile-block',
      'surface',
      {
        'desk-tile-block--primary': primary,
        'desk-tile-block--critical': primary && variant === 'critical',
      },
    ]"
    data-tile
  >
    <Skeleton v-if="loading" height="4rem" />
    <template v-else-if="value !== undefined">
      <!-- The figure comes first in the text flow; the label is placed above it by order. -->
      <span
        :class="[
          'desk-tile-value',
          { 'desk-tile-value--critical': variant === 'critical', 'desk-tile-value--words': words },
        ]"
        data-testid="tile-amount"
        :data-tile-primary="primary ? 'figure' : undefined"
        >{{ value }}</span
      >
      <span class="desk-tile-label">{{ label }}</span>
      <p v-if="note" class="desk-forecast-basis">{{ note }}</p>
      <p
        v-for="s in status"
        :key="s.text"
        :class="['desk-tile-status', `desk-tile-status--${s.tone}`]"
      >
        {{ s.text }}
      </p>
      <div v-if="$slots.action" class="desk-tile-action"><slot name="action" /></div>
    </template>
    <slot v-else />
  </div>
</template>

<style scoped>
/* A raised flap (DESIGN.md Components > Tile); sizes itself by its own width (container query). */
.desk-tile-block {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-tile-block--primary {
  gap: var(--space-2);
  /* The hero tile: accent border plus a 1px inset ring; red instead when over budget. */
  border-color: var(--color-accent);
  box-shadow:
    var(--shadow-raised),
    inset 0 0 0 1px var(--color-accent);
}
.desk-tile-block--critical {
  border-color: var(--color-critical);
  box-shadow:
    var(--shadow-raised),
    inset 0 0 0 1px var(--color-critical);
}
.desk-tile-action {
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  font-weight: 600;
}
.desk-tile-action :deep(a) {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  color: var(--color-fg);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.desk-tile-action :deep(a:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-tile-label {
  order: -1;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-tile-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-figure);
  line-height: var(--leading-lg);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.desk-tile-block--primary .desk-tile-value {
  /* Display role, fluid 2rem at 360 to 2.5rem at 1280 (DESIGN.md Typography). */
  font-size: var(--text-display-fluid);
  line-height: var(--leading-display);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
.desk-tile-block--primary .desk-tile-value--words {
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-normal);
  white-space: nowrap;
}
.desk-tile-value--critical {
  color: var(--color-critical);
}
.desk-forecast-basis,
.desk-tile-status {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-tile-status {
  font-weight: 600;
}
.desk-tile-status--warn {
  color: var(--color-warn);
}
.desk-tile-status--critical {
  color: var(--color-critical);
}
/* A narrow tile (two-up at 360) keeps a six-digit sum inside itself. */
@container (max-width: 11rem) {
  .desk-tile-value {
    font-size: var(--text-md);
    line-height: var(--leading-md);
  }
  .desk-tile-block--primary .desk-tile-value:not(.desk-tile-value--words) {
    font-size: var(--text-xl);
    line-height: var(--leading-xl);
  }
}
</style>
