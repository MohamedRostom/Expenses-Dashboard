<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ExpenseResponseT } from '@desk/contracts';
import { EmptyState, ErrorState, Skeleton } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { useExpensesStore } from '../stores/expenses.js';
import { formatDate, formatMoney } from '../utils/format.js';

const store = useExpensesStore();
const deleted = ref<ExpenseResponseT[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // Deliberately NOT month-scoped — the bin holds everything ever soft-deleted, not just
    // whatever month MonthView last happened to have loaded. from/to span the whole plausible
    // range instead of a `month` param (the API defaults to the current month when neither is
    // given).
    const res = await apiFetch<{ expenses: ExpenseResponseT[] }>(
      `/expenses?from=1970-01-01&to=2999-12-31&includeDeleted=true`,
    );
    deleted.value = res.expenses.filter((e) => e.deletedAt != null);
  } catch (err) {
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    loading.value = false;
  }
}

async function onRestore(id: string) {
  await store.restore(id);
  deleted.value = deleted.value.filter((e) => e.id !== id);
}

onMounted(load);
</script>

<template>
  <main class="desk-bin-view">
    <h1>Bin</h1>
    <Skeleton v-if="loading" height="8rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <EmptyState v-else-if="deleted.length === 0" title="Nothing in the bin" />
    <table v-else class="desk-bin-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Description</th>
          <th scope="col">Amount</th>
          <th scope="col"><span class="desk-sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in deleted" :key="e.id">
          <td>{{ formatDate(e.date) }}</td>
          <td>{{ e.description }}</td>
          <td>{{ formatMoney(e.amountOriginal, e.currencyOriginal) }}</td>
          <td><button type="button" @click="onRestore(e.id)">Restore</button></td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
.desk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.desk-bin-view {
  max-width: 50rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-bin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.desk-bin-table th,
.desk-bin-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-bin-table button {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
}
</style>
