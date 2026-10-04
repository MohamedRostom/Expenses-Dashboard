<script setup lang="ts">
/** Accessible table alternative to CategoryBars — CLAUDE.md: "table view always available". */
import { computed, ref } from 'vue';
import type { CategoryBarData } from '../charts/CategoryBars.vue';

const props = defineProps<{
  categories: CategoryBarData[];
  /** C7: caller supplies currency-aware formatting (@desk/ui has no @desk/core dependency).
   * Falls back to a fixed 2dp/100 read for callers that haven't been updated yet. */
  formatMoney?: (minor: number) => string;
  caption?: string;
  /** Headers become buttons with aria-sort; click toggles ascending/descending. */
  sortable?: boolean;
  dense?: boolean;
}>();

type SortKey = 'name' | 'spent' | 'budget' | 'remaining';
const COLUMNS: [SortKey, string][] = [
  ['name', 'Category'],
  ['spent', 'Spent'],
  ['budget', 'Budget'],
  ['remaining', 'Remaining'],
];
const sort = ref<{ key: SortKey; dir: 1 | -1 } | null>(null);
function sortBy(key: SortKey) {
  const cur = sort.value;
  sort.value = { key, dir: cur?.key === key && cur.dir === 1 ? -1 : 1 };
}
function ariaSort(key: SortKey) {
  const cur = sort.value;
  if (cur?.key !== key) return 'none';
  return cur.dir === 1 ? 'ascending' : 'descending';
}
const value = (c: CategoryBarData, key: SortKey) =>
  key === 'name'
    ? c.name
    : key === 'remaining'
      ? c.budget == null
        ? null
        : c.budget - c.spent
      : c[key];
// ponytail: rows without a budget sort as lowest; add a nulls-last rule if that reads wrong.
const rows = computed(() => {
  const cur = sort.value;
  if (!props.sortable || !cur) return props.categories;
  return [...props.categories].sort((a, b) => {
    const x = value(a, cur.key) ?? -Infinity;
    const y = value(b, cur.key) ?? -Infinity;
    return (x < y ? -1 : x > y ? 1 : 0) * cur.dir;
  });
});

function formatMinor(amount: number): string {
  return props.formatMoney ? props.formatMoney(amount) : (amount / 100).toFixed(2);
}

function remaining(c: CategoryBarData): string {
  if (c.budget == null) return '—';
  return formatMinor(c.budget - c.spent);
}
</script>

<template>
  <table :class="['desk-data-table', { 'desk-data-table--dense': dense }]">
    <caption v-if="caption">
      {{
        caption
      }}
    </caption>
    <thead>
      <tr>
        <th
          v-for="[key, label] in COLUMNS"
          :key="key"
          scope="col"
          :aria-sort="sortable ? ariaSort(key) : undefined"
        >
          <button v-if="sortable" type="button" class="desk-data-table-sort" @click="sortBy(key)">
            {{ label }}
          </button>
          <template v-else>{{ label }}</template>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in rows" :key="c.id">
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
.desk-data-table--dense th,
.desk-data-table--dense td {
  padding: 0.2rem 0.6rem;
}
.desk-data-table-sort {
  all: unset;
  cursor: pointer;
}
.desk-data-table-sort:focus-visible {
  outline: 2px solid var(--color-accent);
}
</style>
