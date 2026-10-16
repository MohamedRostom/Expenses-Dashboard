<script setup lang="ts">
/** Accessible table. By default the category table (CLAUDE.md: "table view always available");
 * with `columns` it is the board: heads from `columns`, rows from the default slot (`<tr>`s whose
 * cells carry the `desk-col--*` classes below). Fixed columns, figure-face amounts, row lamps. */
import { computed, ref } from 'vue';
import Skeleton from './Skeleton.vue';
import type { CategoryBarData } from '../charts/CategoryBars.vue';

export interface BoardColumn {
  key: string;
  label: string;
  align?: 'end';
  /** Fixed width class: date, amount, action; the rest share what is left. */
  width?: 'date' | 'amount' | 'action';
  /** Hidden below 768px (the category column returns from there). */
  hideBelow?: 'md';
  /** Head is read by screen readers only (lamp, actions). */
  srOnly?: boolean;
}

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    categories?: CategoryBarData[];
    /** C7: caller supplies currency-aware formatting (@desk/ui has no @desk/core dependency).
     * Falls back to a fixed 2dp/100 read for callers that haven't been updated yet. */
    formatMoney?: (minor: number) => string;
    caption?: string;
    /** Headers become buttons with aria-sort; click toggles ascending/descending. */
    sortable?: boolean;
    dense?: boolean;
    /** Skeleton rows replace the data; the table is marked busy. */
    loading?: boolean;
    /** Board mode: these columns, rows from the default slot. */
    columns?: BoardColumn[];
  }>(),
  { categories: () => [] },
);

type SortKey = 'name' | 'spent' | 'budget' | 'remaining';
const COLUMNS: [SortKey, string][] = [
  ['name', 'Category'],
  ['spent', 'Spent'],
  ['budget', 'Budget'],
  ['remaining', 'Remaining'],
];
const columnCount = computed(() => props.columns?.length ?? COLUMNS.length);
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

const colClass = (c: BoardColumn) => [
  'desk-col',
  c.width ? `desk-col--${c.width}` : 'desk-col--fill',
  { 'desk-col--end': c.align === 'end', 'desk-col--md': c.hideBelow === 'md' },
];
</script>

<template>
  <!-- The wrapper scrolls a wide category table inside its panel instead of the page (so it is a
       focusable region); the board is fixed-layout and never needs it. -->
  <div
    class="desk-data-table-wrap"
    :class="{ 'desk-data-table-wrap--board': columns }"
    :tabindex="columns ? undefined : 0"
    :role="columns ? undefined : 'region'"
    :aria-label="columns ? undefined : (caption ?? 'Table')"
  >
    <table
      v-bind="$attrs"
      :class="[
        'desk-data-table',
        { 'desk-data-table--dense': dense, 'desk-data-table--board': columns },
      ]"
      :aria-busy="loading ? 'true' : undefined"
    >
      <caption v-if="caption" :class="{ 'desk-sr-only': columns }">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <template v-if="columns">
            <th v-for="c in columns" :key="c.key" scope="col" :class="colClass(c)">
              <span :class="{ 'desk-sr-only': c.srOnly }">{{ c.label }}</span>
            </th>
          </template>
          <template v-else>
            <th
              v-for="[key, label] in COLUMNS"
              :key="key"
              scope="col"
              :class="{ 'desk-col--end': key !== 'name' }"
              :aria-sort="sortable ? ariaSort(key) : undefined"
            >
              <button
                v-if="sortable"
                type="button"
                class="desk-data-table-sort"
                @click="sortBy(key)"
              >
                {{ label }}
              </button>
              <template v-else>{{ label }}</template>
            </th>
          </template>
        </tr>
      </thead>
      <tbody v-if="loading">
        <tr v-for="n in 3" :key="n">
          <td v-for="m in columnCount" :key="m"><Skeleton /></td>
        </tr>
      </tbody>
      <tbody v-else-if="columns">
        <slot />
      </tbody>
      <tbody v-else>
        <tr v-for="c in rows" :key="c.id">
          <th scope="row">{{ c.name }}</th>
          <td class="desk-col--num">{{ formatMinor(c.spent) }}</td>
          <td class="desk-col--num">{{ c.budget != null ? formatMinor(c.budget) : '—' }}</td>
          <td class="desk-col--num">{{ remaining(c) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.desk-data-table-wrap {
  overflow-x: auto;
}
.desk-data-table-wrap--board {
  overflow: visible;
}
.desk-data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  color: var(--color-fg);
}
.desk-data-table--board {
  table-layout: fixed;
}
.desk-data-table caption {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-data-table .desk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.desk-data-table :deep(th),
.desk-data-table :deep(td) {
  text-align: left;
  vertical-align: middle;
  padding: var(--space-2) var(--space-3);
  height: var(--target-min);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
}
/* Phone width: the board's cells give up side padding so the item column keeps a readable width. */
.desk-data-table--board :deep(td),
.desk-data-table--board :deep(th) {
  padding-inline: var(--space-2);
}
/* Heads take the Label role: small spaced capitals over a 1px Frame Line. */
.desk-data-table thead th {
  height: auto;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
  border-bottom-color: var(--color-border);
}
.desk-data-table :deep(th[scope='row']) {
  font-weight: 400;
}
.desk-data-table :deep(.desk-col--end),
.desk-data-table :deep(.desk-col--num),
.desk-data-table :deep(.desk-col--amount) {
  text-align: right;
}
/* Figures: the mono face with tabular numerals, nothing else. */
.desk-data-table :deep(.desk-col--num),
.desk-data-table :deep(.desk-col--amount),
.desk-data-table :deep(.desk-col--date) {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-data-table :deep(td.desk-col--date) {
  position: relative;
  padding-inline: var(--space-3) var(--space-1);
  color: var(--color-fg-muted);
  white-space: nowrap;
}
.desk-data-table :deep(.desk-col--amount) {
  white-space: nowrap;
}
.desk-data-table :deep(.desk-col--date) {
  width: 3.75rem;
}
.desk-data-table :deep(.desk-col--amount) {
  width: 7rem;
}
.desk-data-table :deep(th.desk-col--action),
.desk-data-table :deep(td.desk-col--action) {
  width: 4rem;
  padding: 0;
  text-align: center;
}
.desk-data-table :deep(.desk-col--md) {
  display: none;
}
/* The currency code sits under the figure at phone width, beside it from 768. */
.desk-data-table :deep(.desk-amount-fig) {
  display: block;
}
.desk-data-table :deep(.desk-amount-code) {
  display: block;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
/* A row lamp: a 4px bar beside the row, always paired with a word. */
.desk-data-table :deep(.desk-row-lamp) {
  position: absolute;
  inset-block: var(--space-1);
  left: var(--space-1);
  width: var(--space-1);
}
.desk-data-table :deep(.desk-row-lamp--warn) {
  background: var(--color-warn);
}
.desk-data-table :deep(.desk-row-lamp--critical) {
  background: var(--color-critical);
}
.desk-data-table :deep(.desk-item) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* At phone width the item may take two lines so the part that tells rows apart survives. */
.desk-data-table :deep(.desk-item-name) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.desk-data-table :deep(.desk-item-cat) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-fg-muted);
}
.desk-data-table :deep(.desk-status-word) {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
}
.desk-data-table :deep(.desk-status-word--warn) {
  color: var(--color-warn);
}
.desk-data-table :deep(.desk-status-word--critical) {
  color: var(--color-critical);
}
.desk-data-table :deep(.desk-item-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
/* Icon actions in a row: narrower than a text button, still 44px tall at phone width. */
.desk-data-table :deep(td .desk-row-action) {
  min-width: var(--space-8);
  padding-inline: var(--space-1);
  color: var(--color-fg-muted);
}
.desk-data-table :deep(td .desk-row-action:hover:not(:disabled)) {
  color: var(--color-fg);
}
.desk-data-table :deep(td .desk-row-action svg) {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
}
.desk-data-table-sort {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  cursor: pointer;
}
.desk-data-table-sort:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
@media (min-width: 768px) {
  .desk-data-table--board :deep(td),
  .desk-data-table--board :deep(th) {
    padding-inline: var(--space-3);
  }
  .desk-data-table :deep(.desk-col--date) {
    width: var(--space-16);
  }
  .desk-data-table :deep(.desk-col--amount) {
    width: 9rem;
  }
  .desk-data-table :deep(th.desk-col--md),
  .desk-data-table :deep(td.desk-col--md) {
    display: table-cell;
    width: 30%;
    color: var(--color-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .desk-data-table :deep(.desk-amount-fig),
  .desk-data-table :deep(.desk-amount-code) {
    display: inline;
  }
  .desk-data-table :deep(.desk-item-cat) {
    display: none;
  }
}
/* Compact density at desktop review: 32px rows (DESIGN.md Components, density dial). */
@media (min-width: 1024px) {
  .desk-data-table--dense :deep(td),
  .desk-data-table--dense :deep(th),
  .desk-data-table--board :deep(td) {
    height: var(--space-8);
    padding-block: 0;
  }
  .desk-data-table :deep(.desk-item-name) {
    display: block;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .desk-data-table :deep(td .desk-row-action) {
    min-height: var(--space-8);
  }
}
</style>
