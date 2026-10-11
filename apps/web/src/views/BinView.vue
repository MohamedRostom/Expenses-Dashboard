<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ExpenseResponseT } from '@desk/contracts';
import { Button, DataTable, EmptyState, ErrorState, Skeleton, type BoardColumn } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { useExpensesStore } from '../stores/expenses.js';
import { formatDate, formatMoney } from '../utils/format.js';

const columns: BoardColumn[] = [
  { key: 'date', label: 'Date', hideBelow: 'md' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount', align: 'end', width: 'amount' },
  { key: 'actions', label: 'Actions', width: 'action', srOnly: true },
];
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
    <DataTable v-else :columns="columns" dense caption="Bin">
      <tr v-for="e in deleted" :key="e.id">
        <td class="desk-col--md desk-col--date">{{ formatDate(e.date) }}</td>
        <td>
          <span class="desk-item">
            <span class="desk-item-name">{{ e.description }}</span>
            <!-- Phone width: the date sits under the description; from 768 it has its own column. -->
            <span class="desk-item-cat desk-bin-date">{{ formatDate(e.date) }}</span>
          </span>
        </td>
        <td class="desk-col--amount">{{ formatMoney(e.amountOriginal, e.currencyOriginal) }}</td>
        <td class="desk-col--action">
          <Button variant="ghost" size="sm" @click="onRestore(e.id)">Restore</Button>
        </td>
      </tr>
    </DataTable>
  </main>
</template>

<style scoped>
.desk-bin-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
@media (min-width: 768px) {
  .desk-bin-date {
    display: none;
  }
}
</style>
