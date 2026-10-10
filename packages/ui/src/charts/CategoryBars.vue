<script setup lang="ts">
/**
 * Horizontal bar per category, spent vs budget (minor units), every bar on one shared scale
 * (DESIGN.md Layout). Single accent hue; a 1px ink tick marks the budget; the part of a bar past
 * its budget is solid critical, and the row also says "over" in words and takes a 4px lamp.
 * Amounts print exactly as `formatMoney` returns them (the caller owns the currency code).
 */
export interface CategoryBarData {
  id: string;
  name: string;
  spent: number;
  budget: number | null;
}

const props = defineProps<{
  categories: CategoryBarData[];
  currency: string;
  /** C7: caller supplies currency-aware formatting (@desk/ui has no @desk/core dependency). */
  formatMoney?: (minor: number) => string;
}>();

const groupMax = () =>
  Math.max(1, ...props.categories.map((c) => Math.max(c.spent, c.budget ?? 0)));

const pct = (minor: number) => Math.min(100, (minor / groupMax()) * 100);

/** Length of the accent part: spend up to the budget (all of it when there is no budget). */
function barPct(c: CategoryBarData): number {
  return pct(c.budget != null && c.budget > 0 ? Math.min(c.spent, c.budget) : c.spent);
}

function tickPct(c: CategoryBarData): number | null {
  return c.budget ? pct(c.budget) : null;
}

function isOverBudget(c: CategoryBarData): boolean {
  return c.budget != null && c.spent > c.budget;
}

/** Start and length of the part past the budget. */
const overPct = (c: CategoryBarData) => pct(c.spent) - pct(c.budget ?? 0);

function formatMinor(amount: number): string {
  if (props.formatMoney) return props.formatMoney(amount);
  const exponent = 2;
  return `${(amount / 10 ** exponent).toFixed(exponent)} ${props.currency}`;
}

defineExpose({ barPct, tickPct, isOverBudget });
</script>

<template>
  <div class="desk-category-bars">
    <div v-for="c in categories" :key="c.id" class="desk-category-bars-row">
      <span
        :class="[
          'desk-category-bars-lamp',
          { 'desk-category-bars-lamp--critical': isOverBudget(c) },
        ]"
      />
      <div class="desk-category-bars-body">
        <div class="desk-category-bars-label">
          <span class="desk-category-bars-name" data-testid="category-name" :title="c.name">{{
            c.name
          }}</span>
          <span class="desk-category-bars-amounts">
            {{ formatMinor(c.spent)
            }}<template v-if="c.budget != null"> / {{ formatMinor(c.budget) }}</template>
          </span>
        </div>
        <svg
          class="desk-category-bars-svg"
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`${c.name}: ${formatMinor(c.spent)} of ${c.budget != null ? formatMinor(c.budget) : 'no budget'}`"
        >
          <rect x="0" y="0" width="100" height="8" class="desk-category-bars-track" />
          <rect x="0" y="0" :width="barPct(c)" height="8" class="desk-category-bars-fill" />
          <rect
            v-if="isOverBudget(c)"
            :x="pct(c.budget!)"
            y="0"
            :width="overPct(c)"
            height="8"
            class="desk-category-bars-fill-critical"
          />
          <line
            v-if="tickPct(c) != null"
            :x1="tickPct(c)!"
            :x2="tickPct(c)!"
            y1="-2"
            y2="8"
            class="desk-category-bars-tick"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span v-if="isOverBudget(c)" class="desk-category-bars-over"
          >{{ formatMinor(c.spent - c.budget!) }} over</span
        >
        <span v-else-if="c.budget == null" class="desk-category-bars-note">no budget</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desk-category-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  font-family: var(--font-sans);
}
.desk-category-bars-row {
  display: grid;
  grid-template-columns: var(--space-1) minmax(0, 1fr);
  column-gap: var(--space-3);
}
.desk-category-bars-lamp--critical {
  background: var(--color-critical);
}
.desk-category-bars-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.desk-category-bars-label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  column-gap: var(--space-3);
  font-size: var(--text-md);
  color: var(--color-fg);
}
/* A long name ellipsises (full name in the title); the figures drop to a second line before it does. */
.desk-category-bars-name {
  flex: 1 1 var(--space-24);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desk-category-bars-amounts {
  flex: none;
  margin-left: auto;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
}
.desk-category-bars-svg {
  display: block;
  width: 100%;
  height: var(--space-2);
  overflow: visible;
}
.desk-category-bars-track {
  fill: var(--color-border);
  opacity: 0.25;
}
.desk-category-bars-fill {
  fill: var(--color-accent);
}
.desk-category-bars-fill-critical {
  fill: var(--color-critical);
}
.desk-category-bars-tick {
  stroke: var(--color-fg);
  stroke-width: 1;
}
.desk-category-bars-over,
.desk-category-bars-note {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-category-bars-over {
  color: var(--color-critical);
  font-weight: 600;
}
</style>
