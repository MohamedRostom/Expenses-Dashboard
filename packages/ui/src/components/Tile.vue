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
  /** Status words after the note, in the tone's colour (amber pending, red over). Always words. */
  status?: { text: string; tone: 'warn' | 'critical' }[];
}>();
</script>

<template>
  <div :class="['desk-tile-block', { 'desk-tile-block--primary': primary }]" data-tile>
    <Skeleton v-if="loading" height="4rem" />
    <template v-else-if="value !== undefined">
      <!-- The figure comes first in the text flow; the label is placed above it by order. -->
      <span :class="['desk-tile-cell', { 'desk-tile-cell--seam': primary }]">
        <span
          :class="['desk-tile-value', { 'desk-tile-value--critical': variant === 'critical' }]"
          data-testid="tile-amount"
          :data-tile-primary="primary ? 'figure' : undefined"
          >{{ value }}</span
        >
      </span>
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
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-raised);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-tile-block--primary {
  background: var(--color-surface-raised);
  gap: var(--space-2);
}
/* The primary figure sits in a flap cell whose seam shows only at its hinges (the side margins),
   never across the glyphs, so it cannot read as a strikethrough (DESIGN.md Tile). */
.desk-tile-cell {
  display: contents;
}
.desk-tile-cell--seam {
  display: block;
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  margin-inline: calc(-1 * var(--space-3));
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}
.desk-tile-cell--seam::before,
.desk-tile-cell--seam::after {
  content: '';
  position: absolute;
  top: 50%;
  width: var(--space-2);
  border-top: 1px solid var(--color-border);
  pointer-events: none;
}
.desk-tile-cell--seam::before {
  left: 0;
}
.desk-tile-cell--seam::after {
  right: 0;
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
  font-size: var(--text-lg);
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
  .desk-tile-block--primary .desk-tile-value {
    font-size: var(--text-xl);
    line-height: var(--leading-xl);
  }
}
</style>
