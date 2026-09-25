<script setup lang="ts">
/**
 * 12 month bars for a year, one per month. Hand-written SVG, single accent hue — matches
 * CategoryBars.vue's visual language. A data table alongside (CLAUDE.md: "table view always
 * available") and a per-bar aria-label give it an accessible fallback with no dependency on
 * colour or hover state.
 */
export interface YearBarData {
  month: string; // 'YYYY-MM'
  spent: number;
  budgeted: number;
}

const props = defineProps<{
  months: YearBarData[];
  currency: string;
  /** C7: caller supplies currency-aware formatting (@desk/ui has no @desk/core dependency). */
  formatMoney?: (minor: number) => string;
}>();

const emit = defineEmits<{ select: [month: string] }>();

function formatMinor(amount: number): string {
  return props.formatMoney ? props.formatMoney(amount) : (amount / 100).toFixed(2);
}

function monthLabel(month: string): string {
  const [, m] = month.split('-');
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ]!;
}

function groupMax(): number {
  return Math.max(1, ...props.months.map((m) => Math.max(m.spent, m.budgeted)));
}

function barPct(m: YearBarData): number {
  return Math.min(100, (m.spent / groupMax()) * 100);
}

function isOverBudget(m: YearBarData): boolean {
  return m.budgeted > 0 && m.spent > m.budgeted;
}

defineExpose({ barPct, isOverBudget, monthLabel });
</script>

<template>
  <div class="desk-year-bars">
    <div
      class="desk-year-bars-chart"
      role="group"
      :aria-label="`Monthly spend for the year, in ${currency}`"
    >
      <button
        v-for="m in months"
        :key="m.month"
        type="button"
        class="desk-year-bars-col"
        :aria-label="`${monthLabel(m.month)}: ${formatMinor(m.spent)} ${currency}`"
        @click="emit('select', m.month)"
      >
        <svg class="desk-year-bars-svg" viewBox="0 0 10 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="10" height="100" class="desk-year-bars-track" />
          <rect
            x="0"
            :y="100 - barPct(m)"
            width="10"
            :height="barPct(m)"
            :class="isOverBudget(m) ? 'desk-year-bars-fill-critical' : 'desk-year-bars-fill'"
          />
        </svg>
        <span class="desk-year-bars-label">{{ monthLabel(m.month) }}</span>
      </button>
    </div>

    <table class="desk-year-bars-table">
      <caption class="desk-year-bars-caption">
        Monthly totals, table view
      </caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Spent</th>
          <th scope="col">Budgeted</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in months" :key="m.month">
          <th scope="row">{{ m.month }}</th>
          <td>{{ formatMinor(m.spent) }}</td>
          <td>{{ formatMinor(m.budgeted) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.desk-year-bars {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: var(--font-sans);
}
.desk-year-bars-chart {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  /* Grid items must stretch (the default — align-items:end was here before) so each column's
     height:100% below resolves to the full 10rem row; the bar itself still visually grows from
     the bottom via the SVG rect's own y="100 - barPct" math, not via this alignment. Without
     stretch, height:100% is indeterminate, the SVG's flex:1 has nothing to fill, and it falls
     back to its viewBox's 1:10 aspect ratio at the column's width — several times taller than
     10rem, overlapping the table below (confirmed via a manual screenshot: bars ran ~700-900px
     tall instead of 160px, with the "table view" rows rendered inside that oversized area). */
  gap: 0.4rem;
  height: 10rem;
}
.desk-year-bars-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  /* height:100% here previously didn't resolve to a definite pixel value against the grid's
     stretched row track (measured via getComputedStyle: computed to 758px, driven by the child
     SVG's own aspect-ratio-derived size, not the intended 10rem) — an explicit height matching
     .desk-year-bars-chart's, rather than a percentage through the grid-stretch chain, is
     unambiguous. */
  height: 10rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--color-fg);
}
.desk-year-bars-svg {
  width: 100%;
  flex: 1;
  /* Flex items default to min-height:auto, which for a replaced element with an intrinsic aspect
     ratio (this SVG's viewBox is 10:100, i.e. 1:10) resolves via that ratio at the item's width —
     ~74px wide * 10 = ~740px — overriding flex:1's shrink and overflowing the 10rem column
     (measured via a manual script: .desk-year-bars-col rendered 758px tall against a 160px grid
     track). min-height:0 removes that floor so flex:1 actually shrinks to fit.
  */
  min-height: 0;
}
.desk-year-bars-track {
  fill: var(--color-fg);
  opacity: 0.08;
}
.desk-year-bars-fill {
  fill: var(--color-accent);
}
.desk-year-bars-fill-critical {
  fill: var(--color-critical);
}
.desk-year-bars-label {
  font-size: 0.7rem;
  font-family: var(--font-mono);
}
.desk-year-bars-caption {
  text-align: left;
  font-size: 0.8rem;
  opacity: 0.7;
  padding-bottom: 0.35rem;
}
.desk-year-bars-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 0.85rem;
}
.desk-year-bars-table th,
.desk-year-bars-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-year-bars-table td {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
