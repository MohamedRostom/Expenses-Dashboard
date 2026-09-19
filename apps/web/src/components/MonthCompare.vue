<script setup lang="ts">
/** This-month-vs-last-month deltas: total and top categories, via /summary/compare. */
import { computed, onMounted, ref } from 'vue';
import type { CategoryResponseT, CompareSummaryT } from '@desk/contracts';
import { Skeleton } from '@desk/ui';
import { apiFetch } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { currentMonth } from '../stores/expenses.js';
import { useSessionStore } from '../stores/session.js';
import { toPanelErrorKind, type PanelErrorKind } from '../utils/errors.js';
import PanelState from './PanelState.vue';

const session = useSessionStore();
const currency = computed(() => session.user?.defaultCurrency ?? 'GBP');
const compare = ref<CompareSummaryT | null>(null);
const categoryNames = ref<Record<string, string>>({});
const loading = ref(false);
const errorKind = ref<PanelErrorKind | null>(null);

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function categoryLabel(id: string): string {
  return categoryNames.value[id] ?? id;
}

async function load() {
  loading.value = true;
  errorKind.value = null;
  try {
    const a = currentMonth();
    const b = previousMonth(a);
    const [compareRes, categoriesRes] = await Promise.all([
      apiFetch<CompareSummaryT>(`/summary/compare?a=${a}&b=${b}`),
      apiFetch<{ categories: CategoryResponseT[] }>('/categories'),
    ]);
    compare.value = compareRes;
    categoryNames.value = Object.fromEntries(categoriesRes.categories.map((c) => [c.id, c.name]));
  } catch (err) {
    errorKind.value = toPanelErrorKind(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const total = computed(() => compare.value?.byCategory.reduce((acc, c) => acc + c.delta, 0) ?? 0);

const topCategories = computed(() =>
  [...(compare.value?.byCategory ?? [])]
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 3),
);

defineExpose({ load });
</script>

<template>
  <div class="desk-month-compare" data-testid="month-compare">
    <Skeleton v-if="loading" height="3rem" />
    <template v-else-if="compare">
      <p class="desk-month-compare-total">
        {{ compare.a }} vs {{ compare.b }}:
        <strong>{{ total >= 0 ? '+' : '' }}{{ formatMoney(total, currency) }}</strong>
      </p>
      <ul v-if="topCategories.length > 0" class="desk-month-compare-list">
        <li v-for="c in topCategories" :key="c.categoryId">
          {{ categoryLabel(c.categoryId) }}: {{ c.delta >= 0 ? '+' : ''
          }}{{ formatMoney(c.delta, currency) }}
        </li>
      </ul>
    </template>
    <PanelState v-else-if="errorKind" kind="error" :code="errorKind" />
  </div>
</template>

<style scoped>
.desk-month-compare {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.desk-month-compare-total {
  margin: 0;
}
.desk-month-compare-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
