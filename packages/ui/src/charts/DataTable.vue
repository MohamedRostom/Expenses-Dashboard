<script setup lang="ts">
/** Accessible table alternative to CategoryBars — CLAUDE.md: "table view always available". */
import type { CategoryBarData } from './CategoryBars.vue';

const props = defineProps<{
  categories: CategoryBarData[];
  /** C7: caller supplies currency-aware formatting (@desk/ui has no @desk/core dependency).
   * Falls back to a fixed 2dp/100 read for callers that haven't been updated yet. */
  formatMoney?: (minor: number) => string;
}>();

function formatMinor(amount: number): string {
  return props.formatMoney ? props.formatMoney(amount) : (amount / 100).toFixed(2);
}

function remaining(c: CategoryBarData): string {
  if (c.budget == null) return '—';
  return formatMinor(c.budget - c.spent);
}
</script>

<template>
  <table class="desk-data-table">
    <thead>
      <tr>
        <th scope="col">Category</th>
        <th scope="col">Spent</th>
        <th scope="col">Budget</th>
        <th scope="col">Remaining</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in categories" :key="c.id">
        <th scope="row">{{ c.name }}</th>
        <td>{{ formatMinor(c.spent) }}</td>
        <td>{{ c.budget != null ? formatMinor(c.budget) : '—' }}</td>
        <td>{{ remaining(c) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.desk-data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 0.85rem;
}
.desk-data-table th,
.desk-data-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-data-table td {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
