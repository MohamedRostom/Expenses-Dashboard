<script setup lang="ts">
/**
 * Horizontal bar per category, spent vs budget (minor units). Bar length is
 * relative to the category's own budget when set (progress-toward-budget
 * reading), else relative to the max spent across all categories. Single
 * accent hue normally; flips to the critical token when over budget.
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

function barPct(c: CategoryBarData): number {
  const denom = c.budget && c.budget > 0 ? c.budget : groupMax();
  return Math.min(100, (c.spent / denom) * 100);
}

function tickPct(c: CategoryBarData): number | null {
  if (!c.budget) return null;
  const denom = c.budget > 0 ? c.budget : groupMax();
  return Math.min(100, (c.budget / denom) * 100);
}

function isOverBudget(c: CategoryBarData): boolean {
  return c.budget != null && c.spent > c.budget;
}

function formatMinor(amount: number): string {
  if (props.formatMoney) return props.formatMoney(amount);
  const exponent = 2;
  return (amount / 10 ** exponent).toFixed(exponent);
}

defineExpose({ barPct, tickPct, isOverBudget });
</script>

<template>
  <div class="desk-category-bars">
    <div v-for="c in categories" :key="c.id" class="desk-category-bars-row">
      <div class="desk-category-bars-label">
        <span>{{ c.name }}</span>
        <span class="desk-category-bars-amounts">
          {{ formatMinor(c.spent)
          }}<template v-if="c.budget != null"> / {{ formatMinor(c.budget) }}</template>
          {{ currency }}
        </span>
      </div>
      <svg
        class="desk-category-bars-svg"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`${c.name}: ${formatMinor(c.spent)} of ${c.budget != null ? formatMinor(c.budget) : 'no budget'} ${currency}`"
      >
        <rect x="0" y="0" width="100" height="10" class="desk-category-bars-track" />
        <rect
          x="0"
          y="0"
          :width="barPct(c)"
          height="10"
          :class="isOverBudget(c) ? 'desk-category-bars-fill-critical' : 'desk-category-bars-fill'"
        />
        <line
          v-if="tickPct(c) != null"
          :x1="tickPct(c)!"
          :x2="tickPct(c)!"
          y1="0"
          y2="10"
          class="desk-category-bars-tick"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.desk-category-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-family: var(--font-sans);
}
.desk-category-bars-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.desk-category-bars-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--color-fg);
}
.desk-category-bars-amounts {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-category-bars-svg {
  width: 100%;
  height: 0.75rem;
}
.desk-category-bars-track {
  fill: var(--color-fg);
  opacity: 0.08;
}
.desk-category-bars-fill {
  fill: var(--color-accent);
}
.desk-category-bars-fill-critical {
  fill: var(--color-critical);
}
.desk-category-bars-tick {
  stroke: var(--color-fg);
  stroke-width: 0.6;
}
</style>
