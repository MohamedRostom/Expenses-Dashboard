<script setup lang="ts">
/** Single-category drill-down: spend over a range of months, via /summary/category/:id. */
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { CategoryDrilldownT } from '@desk/contracts';
import { EmptyState, ErrorState, Skeleton } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';

const route = useRoute();
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

const currency = () => session.user?.defaultCurrency ?? 'GBP';
</script>

<template>
  <main class="desk-category-view">
    <h1>Category history</h1>

    <Skeleton v-if="loading" height="12rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <template v-else-if="drilldown">
      <EmptyState v-if="drilldown.months.every((m) => m.spent === 0)" title="No spend recorded" />
      <table v-else class="desk-category-view-table">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Spent</th>
            <th scope="col">Budget</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in drilldown.months" :key="m.month">
            <th scope="row">{{ m.month }}</th>
            <td>{{ formatMoney(m.spent, currency()) }}</td>
            <td>{{ m.budget != null ? formatMoney(m.budget, currency()) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </main>
</template>

<style scoped>
.desk-category-view {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.desk-category-view-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.desk-category-view-table th,
.desk-category-view-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-category-view-table td {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
