<script setup lang="ts">
/** Single-category drill-down: spend over a range of months, via /summary/category/:id. */
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CategoryDrilldownT } from '@desk/contracts';
import { Button, DataTable, EmptyState, ErrorState, Skeleton, type BoardColumn } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const drilldown = ref<CategoryDrilldownT | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const id = route.params.id as string;
    drilldown.value = await apiFetch<CategoryDrilldownT>(`/summary/category/${id}?months=12`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
// Vue Router reuses this component instance across /categories/:id -> /categories/:id2
// navigations (same route record) — onMounted alone never re-fires, so without this watch the
// drilldown for the previous category stayed on screen.
watch(() => route.params.id, load);

const columns: BoardColumn[] = [
  { key: 'month', label: 'Month' },
  { key: 'spent', label: 'Spent', align: 'end', width: 'amount' },
  { key: 'budget', label: 'Budget', align: 'end', width: 'amount' },
];
const currency = () => session.user?.defaultCurrency ?? 'GBP';
</script>

<template>
  <main class="desk-category-view">
    <h1>Category history</h1>

    <Skeleton v-if="loading" height="12rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <template v-else-if="drilldown">
      <EmptyState
        v-if="drilldown.months.every((m) => m.spent === 0)"
        title="No spend recorded"
        description="Nothing was spent in this category over the last 12 months."
      >
        <template #action>
          <Button @click="router.push('/add')">Add an expense</Button>
        </template>
      </EmptyState>
      <DataTable v-else :columns="columns" dense caption="Spend by month">
        <tr v-for="m in drilldown.months" :key="m.month">
          <td class="desk-col--date">{{ m.month }}</td>
          <td class="desk-col--amount">{{ formatMoney(m.spent, currency()) }}</td>
          <td class="desk-col--amount">
            {{ m.budget != null ? formatMoney(m.budget, currency()) : '—' }}
          </td>
        </tr>
      </DataTable>
    </template>
  </main>
</template>

<style scoped>
.desk-category-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
