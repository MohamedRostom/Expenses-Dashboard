<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ExpenseResponseT } from '@desk/contracts';
import {
  Button,
  CategoryBars,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  type CategoryBarData,
} from '@desk/ui';
import { useExpensesStore } from '../stores/expenses.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import { formatDate, formatMoney } from '../utils/format.js';
import ExpenseForm from '../components/ExpenseForm.vue';

const store = useExpensesStore();
const showDialog = ref(false);
const editing = ref<ExpenseResponseT | null>(null);

onMounted(() => store.loadMonth());

const monthLabel = computed(() => store.currentMonth);

function shiftMonth(delta: number) {
  const [y, m] = store.currentMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  store.loadMonth(next);
}

useShortcuts({
  onNew: () => openAdd(),
  onPrevMonth: () => shiftMonth(-1),
  onNextMonth: () => shiftMonth(1),
});

const categoryBars = computed<CategoryBarData[]>(
  () =>
    store.summary?.byCategory.map((c) => ({
      id: c.categoryId,
      name: c.categoryId,
      spent: c.spent,
      budget: c.budget,
    })) ?? [],
);

function openAdd() {
  editing.value = null;
  showDialog.value = true;
}
function openEdit(expense: ExpenseResponseT) {
  editing.value = expense;
  showDialog.value = true;
}
function onSaved() {
  showDialog.value = false;
  store.loadMonth();
}
async function onDelete(id: string) {
  await store.remove(id);
}
</script>

<template>
  <main class="desk-month-view">
    <header class="desk-month-view-header">
      <div class="desk-month-switcher">
        <button type="button" aria-label="Previous month" @click="shiftMonth(-1)">‹</button>
        <span class="desk-month-label">{{ monthLabel }}</span>
        <button type="button" aria-label="Next month" @click="shiftMonth(1)">›</button>
      </div>
      <Button @click="openAdd">Add expense</Button>
    </header>

    <Skeleton v-if="store.loading" height="12rem" />
    <ErrorState v-else-if="store.error" :code="store.error ?? undefined" />
    <template v-else-if="store.summary">
      <p
        v-if="store.summary.pendingRates > 0"
        class="desk-month-view-pending"
        data-testid="pending-rates"
      >
        {{ store.summary.pendingRates }} pending rate lookup{{
          store.summary.pendingRates === 1 ? '' : 's'
        }}
      </p>

      <section class="desk-month-view-tiles">
        <div class="desk-tile">
          <span class="desk-tile-label">Spent</span>
          <span class="desk-tile-value">{{
            formatMoney(store.summary.spent, store.summary.currency)
          }}</span>
        </div>
        <div class="desk-tile">
          <span class="desk-tile-label">Budget</span>
          <span class="desk-tile-value">{{
            formatMoney(store.summary.budgeted, store.summary.currency)
          }}</span>
        </div>
        <div class="desk-tile">
          <span class="desk-tile-label">Remaining</span>
          <span class="desk-tile-value">{{
            formatMoney(store.summary.remaining, store.summary.currency)
          }}</span>
        </div>
      </section>

      <EmptyState
        v-if="store.expenses.length === 0"
        title="No expenses this month"
        description="Add one to get started."
      />
      <template v-else>
        <section class="desk-month-view-breakdown">
          <CategoryBars :categories="categoryBars" :currency="store.summary.currency" />
          <DataTable :categories="categoryBars" />
        </section>

        <table class="desk-entries-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in store.expenses" :key="e.id">
              <td>{{ formatDate(e.date) }}</td>
              <td>{{ e.description }}</td>
              <td>{{ e.categoryId ?? '—' }}</td>
              <td>{{ formatMoney(e.amountOriginal, e.currencyOriginal) }}</td>
              <td class="desk-entries-actions">
                <button type="button" @click="openEdit(e)">Edit</button>
                <button type="button" @click="onDelete(e.id)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>

    <Dialog
      :open="showDialog"
      :title="editing ? 'Edit expense' : 'Add expense'"
      @close="showDialog = false"
    >
      <ExpenseForm :expense="editing ?? undefined" @saved="onSaved" @cancel="showDialog = false" />
    </Dialog>
  </main>
</template>

<style scoped>
.desk-month-view {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.desk-month-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.desk-month-switcher {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--font-mono);
}
.desk-month-switcher button {
  background: none;
  border: 1px solid var(--color-fg);
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-fg);
  padding: 0.25rem 0.6rem;
}
.desk-month-view-pending {
  font-size: 0.85rem;
  color: var(--color-warn);
  margin: 0;
}
.desk-month-view-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
}
.desk-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
}
.desk-tile-label {
  font-size: 0.8rem;
  opacity: 0.7;
}
.desk-tile-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 1.25rem;
}
.desk-month-view-breakdown {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.desk-entries-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.desk-entries-table th,
.desk-entries-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-entries-actions {
  display: flex;
  gap: 0.5rem;
}
.desk-entries-actions button {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
@media (min-width: 40rem) {
  .desk-month-view-breakdown {
    flex-direction: row;
  }
  .desk-month-view-breakdown > * {
    flex: 1;
  }
}
</style>
