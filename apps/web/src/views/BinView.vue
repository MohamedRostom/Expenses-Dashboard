<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ExpenseResponseT } from '@desk/contracts';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  PanelFrame,
  Skeleton,
  type BoardColumn,
} from '@desk/ui';
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

/** Optimistic: the row leaves the bin at once and comes back if the restore fails. */
async function onRestore(id: string) {
  const previous = deleted.value;
  deleted.value = previous.filter((e) => e.id !== id);
  try {
    await store.restore(id);
  } catch (err) {
    deleted.value = previous;
    throw err;
  }
}

onMounted(load);
</script>

<template>
  <main class="desk-bin-view">
    <PanelFrame heading="Deleted expenses">
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
            <Button variant="secondary" @click="onRestore(e.id)">Restore</Button>
          </td>
        </tr>
      </DataTable>
    </PanelFrame>
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
/* The table's action column is sized for an icon; Restore is a labelled 44px button. */
.desk-bin-view :deep(th.desk-col--action),
.desk-bin-view :deep(td.desk-col--action) {
  width: auto;
  white-space: nowrap;
}
/* Restore meets the panel's inner right edge and clears the row rules above and below. */
.desk-bin-view :deep(td.desk-col--action) {
  text-align: end;
  padding-block: var(--space-1);
  padding-inline: var(--space-1) var(--space-2);
}
/* A gap between the panel title and the column heads. */
.desk-bin-view :deep(.desk-data-table-wrap) {
  padding-block-start: var(--space-3);
}
@media (min-width: 768px) {
  .desk-bin-view :deep(td.desk-col--action) {
    padding-inline-end: var(--space-3);
  }
  .desk-bin-date {
    display: none;
  }
}
</style>
