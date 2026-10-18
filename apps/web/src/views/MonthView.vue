<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ExpenseResponseT, YearSummaryT } from '@desk/contracts';
import {
  Button,
  CategoryBars,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  PanelFrame,
  Skeleton,
  Tabs,
  Tile,
  TrendSparkline,
  useToast,
  type BoardColumn,
  type CategoryBarData,
  type TrendPoint,
} from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { useExpensesStore } from '../stores/expenses.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import { formatMoney } from '../utils/format.js';
import ExpenseForm from '../components/ExpenseForm.vue';
import ForecastTile from '../components/ForecastTile.vue';
import {
  estimatedTotal,
  list as listQueue,
  discard as discardQueued,
  flushWhenOnline as flushQueue,
  retry as retryQueued,
  type QueuedExpense,
} from '../offline/queue.js';

const WidgetStrip = defineAsyncComponent(() => import('../components/widgets/WidgetStrip.vue'));

const route = useRoute();
const router = useRouter();
const store = useExpensesStore();
// One-way: the strip mounts once the first month load settles (R7) and then stays mounted, so
// month changes and reloads don't refetch widget figures that don't depend on the month.
const settled = ref(false);
watch(
  () => store.loading,
  (loading) => {
    if (!loading) settled.value = true;
  },
);
const toast = useToast();
/** Recently soft-deleted rows this session, id -> description, so the undo banner has something
 * to show for a few seconds even though the row itself is already gone from store.expenses. */
const recentlyDeleted = ref<Map<string, string>>(new Map());
const showDialog = ref(false);
const editing = ref<ExpenseResponseT | null>(null);
const trendPoints = ref<TrendPoint[]>([]);
const categoryNames = ref<Record<string, string>>({});
const queued = ref<QueuedExpense[]>([]);

async function loadQueue() {
  queued.value = await listQueue();
}
const pendingQueued = computed(() => queued.value.filter((r) => r.status === 'pending'));
const rejectedQueued = computed(() => queued.value.filter((r) => r.status === 'rejected'));

async function onRetryQueued(id: string) {
  await retryQueued(id);
  queued.value = await listQueue();
}
async function onDiscardQueued(id: string) {
  await discardQueued(id);
  queued.value = await listQueue();
}
const estimatedPending = computed(() =>
  store.summary ? estimatedTotal(queued.value, store.summary.currency) : 0,
);

async function loadCategoryNames() {
  try {
    const res = await apiFetch<{ categories: { id: string; name: string }[] }>('/categories');
    categoryNames.value = Object.fromEntries(res.categories.map((c) => [c.id, c.name]));
  } catch {
    categoryNames.value = {};
  }
}

async function loadTrend() {
  const year = store.currentMonth.slice(0, 4);
  try {
    const res = await apiFetch<YearSummaryT>(`/summary/year?year=${year}`);
    // /summary/year always returns a full 12-month skeleton, zero-spend months included — without
    // filtering those out first, a user with activity in only one month still got >1 "point" once
    // enough calendar months had passed (e.g. 9 by September), showing a trend of mostly flat
    // zeros. The v-if="trendPoints.length > 1" below only makes sense against months with real
    // activity, matching budgets.spec.ts's documented intent (stays hidden until there's a second
    // month of real spend to compare against).
    trendPoints.value = res.months
      .filter((m) => m.month <= store.currentMonth && m.spent > 0)
      .slice(-6)
      .map((m) => ({ month: m.month, spent: m.spent }));
  } catch {
    trendPoints.value = [];
  }
}

onMounted(() => {
  const month = typeof route.query.month === 'string' ? route.query.month : undefined;
  store.loadMonth(month);
  loadTrend();
  loadCategoryNames();
  loadQueue();
  window.addEventListener('online', onBackOnline);
});

onUnmounted(() => {
  window.removeEventListener('online', onBackOnline);
});

// flush() (also fired on this 'online' event, from initOfflineQueue) is shared while in flight, so
// awaiting it here means the queue and the month totals reload only after the POSTs have landed.
function onBackOnline() {
  void flushQueue().then(() => {
    loadQueue();
    store.loadMonth();
  });
}

const monthLabel = computed(() => store.currentMonth);

function shiftMonth(delta: number) {
  const [y, m] = store.currentMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  store.loadMonth(next);
  loadTrend();
  // Previously left ?month= stale — a refresh or a shared/bookmarked link always landed back on
  // whatever month happened to be current at page-load time, not the one being viewed.
  void router.replace({ query: { ...route.query, month: next } });
}

useShortcuts({
  onNew: () => openAdd(),
  onPrevMonth: () => shiftMonth(-1),
  onNextMonth: () => shiftMonth(1),
});

// Spend first, name as the tiebreaker: the API returns categories in no fixed order, so equal
// amounts (all the $0 rows) would otherwise swap between loads.
const categoryBars = computed<CategoryBarData[]>(() =>
  (
    store.summary?.byCategory.map((c) => ({
      id: c.categoryId,
      name: categoryNames.value[c.categoryId] ?? c.categoryId,
      spent: c.spent,
      budget: c.budget,
    })) ?? []
  ).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name)),
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
  loadQueue();
}
async function onDelete(id: string, description: string) {
  if (!confirm(`Delete "${description}"?`)) return;
  try {
    await store.remove(id);
    // No action-button slot on Toast yet — a brief banner with a real Undo button, instead of
    // just a toast describing that undo exists somewhere.
    recentlyDeleted.value.set(id, description);
    setTimeout(() => recentlyDeleted.value.delete(id), 6000);
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to delete expense.', 'critical');
  }
}
async function onUndoDelete(id: string) {
  try {
    await store.restore(id);
    recentlyDeleted.value.delete(id);
    await store.loadMonth();
    toast.push('Expense restored');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to restore expense.', 'critical');
  }
}

/** formatMoney prints "£4.25 GBP"; the board shows the figure with its code beneath (phone width). */
function splitMoney(text: string) {
  const i = text.lastIndexOf(' ');
  return { figure: text.slice(0, i), code: text.slice(i + 1) };
}
const fmt = (minor: number) => formatMoney(minor, store.summary?.currency ?? 'GBP');
const entryMoney = (e: { amountOriginal: number; currencyOriginal: string }) =>
  splitMoney(formatMoney(e.amountOriginal, e.currencyOriginal));
const dayFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
function shortDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return dayFmt.format(new Date(y!, m! - 1, d));
}
/** A foreign amount whose rate has not arrived yet (the API leaves amountDefault empty). */
const isRatePending = (e: ExpenseResponseT) =>
  e.amountDefault === null && e.currencyOriginal !== store.summary?.currency;

// "Left this month" is the one Display figure (FR-011). The code moves into the note so a
// six-digit sum fits at 360; over budget, the figure goes red and the word "over" follows.
const budgeted = computed(() => (store.summary?.budgeted ?? 0) > 0);
const over = computed(() => budgeted.value && (store.summary?.remaining ?? 0) < 0);
// Not a day count: that would change the board every midnight; the month's last day does not.
const monthEnds = computed(() => {
  const [y, m] = store.currentMonth.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(y!, m!, 0),
  );
});
const leftNote = computed(() =>
  budgeted.value && store.summary
    ? `of ${splitMoney(fmt(store.summary.budgeted)).figure} ${store.summary.currency}, month ends ${monthEnds.value}`
    : undefined,
);
const catTab = ref('bars');
const catTabs = [
  { id: 'bars', label: 'Bars' },
  { id: 'table', label: 'Table' },
];
const overCategories = computed(
  () => categoryBars.value.filter((c) => c.budget != null && c.spent > c.budget).length,
);
const spentStatus = computed(() => {
  const out: { text: string; tone: 'warn' | 'critical' }[] = [];
  const pending = store.summary?.pendingRates ?? 0;
  if (pending > 0) out.push({ text: `${pending} rate pending`, tone: 'warn' });
  if (overCategories.value > 0)
    out.push({
      text: `${overCategories.value} ${overCategories.value === 1 ? 'category' : 'categories'} over`,
      tone: 'critical',
    });
  return out;
});

const entryColumns: BoardColumn[] = [
  { key: 'date', label: 'Date', width: 'date' },
  { key: 'item', label: 'Item' },
  { key: 'category', label: 'Category', hideBelow: 'md' },
  { key: 'amount', label: 'Amount', align: 'end', width: 'amount' },
  { key: 'actions', label: 'Actions', srOnly: true, width: 'action' },
];
</script>

<template>
  <main class="desk-month-view">
    <h1 class="desk-sr-only">{{ monthLabel }}</h1>
    <div
      v-for="[id, description] in recentlyDeleted"
      :key="id"
      class="desk-undo-banner"
      role="status"
    >
      <span>Deleted "{{ description }}".</span>
      <Button variant="ghost" size="sm" @click="onUndoDelete(id)">Undo</Button>
    </div>
    <header class="desk-month-view-header">
      <div class="desk-month-switcher">
        <Button variant="secondary" aria-label="Previous month" @click="shiftMonth(-1)">
          <svg class="desk-month-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </Button>
        <span class="desk-month-label">{{ monthLabel }}</span>
        <Button variant="secondary" aria-label="Next month" @click="shiftMonth(1)">
          <svg class="desk-month-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </Button>
      </div>
      <span v-if="pendingQueued.length > 0" class="desk-pending-badge" data-testid="pending-count">
        {{ pendingQueued.length }} pending
      </span>
      <Button @click="openAdd">Add expense</Button>
    </header>

    <Skeleton v-if="store.loading" height="12rem" />
    <!-- A pending/rejected queue is IndexedDB-backed, independent of the failed network summary
         fetch (store.error) — e.g. offline.spec.ts adds an expense while offline, where
         store.loadMonth() necessarily fails. Falling through to the full-page ErrorState would
         hide the queue the offline feature exists to show, so only show it when there's truly
         nothing else to render. -->
    <template v-else-if="store.error && pendingQueued.length === 0 && rejectedQueued.length === 0">
      <ErrorState :code="store.error ?? undefined" />
      <!-- Also mounts when the month fetch failed (e.g. offline), so cached widget figures show
           (spec edge case "app is offline"). -->
      <WidgetStrip v-if="settled" />
    </template>
    <template v-else-if="store.summary || pendingQueued.length > 0 || rejectedQueued.length > 0">
      <template v-if="store.summary">
        <section class="desk-month-view-tiles" aria-label="Month summary">
          <Tile
            class="desk-tile desk-tile--primary"
            primary
            :words="!budgeted"
            :label="over ? 'Over budget this month' : 'Left this month'"
            :value="budgeted ? splitMoney(fmt(store.summary.remaining)).figure : 'No budget set'"
            :variant="over ? 'critical' : 'default'"
            :note="leftNote"
            :status="
              over ? [{ text: `${fmt(-store.summary.remaining)} over`, tone: 'critical' }] : []
            "
          >
            <template v-if="!budgeted" #action>
              <RouterLink to="/settings/categories">Set a budget</RouterLink>
            </template>
          </Tile>
          <Tile
            class="desk-tile"
            label="Spent"
            :value="fmt(store.summary.spent)"
            :note="`${store.expenses.length} ${store.expenses.length === 1 ? 'entry' : 'entries'}`"
            :status="spentStatus"
          />
          <Tile class="desk-tile" label="Budget" :value="fmt(store.summary.budgeted)" />
          <ForecastTile :month="store.currentMonth" />
        </section>
        <p
          v-if="estimatedPending > 0"
          class="desk-month-view-pending"
          data-testid="estimated-pending"
        >
          + {{ fmt(estimatedPending) }} estimated, not yet synced
        </p>
        <WidgetStrip v-if="settled" />

        <PanelFrame v-if="trendPoints.length > 1" heading="Trend" data-testid="trend-sparkline">
          <div class="desk-month-view-pad"><TrendSparkline :points="trendPoints" /></div>
        </PanelFrame>
      </template>

      <EmptyState
        v-if="
          store.expenses.length === 0 && pendingQueued.length === 0 && rejectedQueued.length === 0
        "
        title="No expenses this month"
        description="Add one to get started."
      />
      <div v-else class="desk-month-view-columns">
        <PanelFrame
          v-if="store.summary"
          heading="Categories"
          data-panel="categories"
          class="desk-panel-categories"
        >
          <div class="desk-month-view-bars">
            <Tabs v-model="catTab" :tabs="catTabs" label="Category view">
              <template #bars>
                <CategoryBars
                  :categories="categoryBars"
                  :currency="store.summary.currency"
                  :format-money="fmt"
                />
              </template>
              <template #table>
                <DataTable
                  caption="Spending by category"
                  :categories="categoryBars"
                  :format-money="fmt"
                />
              </template>
            </Tabs>
          </div>
        </PanelFrame>

        <PanelFrame heading="Entries" data-panel="entries" class="desk-panel-entries">
          <DataTable
            class="desk-entries-table"
            caption="Entries, newest first"
            :columns="entryColumns"
          >
            <tr
              v-for="q in pendingQueued"
              :key="q.id"
              class="desk-entries-pending"
              data-testid="pending-row"
            >
              <td class="desk-col--date">
                <span class="desk-row-lamp desk-row-lamp--warn" />{{ shortDay(q.input.date) }}
              </td>
              <td>
                <span class="desk-item">
                  <span class="desk-item-name">{{ q.input.description }}</span>
                  <span class="desk-status-word desk-status-word--warn">pending</span>
                </span>
              </td>
              <td class="desk-col--md">
                {{ q.input.categoryId ? (categoryNames[q.input.categoryId] ?? '—') : '—' }}
              </td>
              <td class="desk-col--amount">
                <span class="desk-amount-fig">{{
                  splitMoney(formatMoney(q.input.amount.minor, q.input.amount.currency)).figure
                }}</span
                >{{ ' ' }}<span class="desk-amount-code">{{ q.input.amount.currency }}</span>
              </td>
              <td class="desk-col--action"></td>
            </tr>
            <tr
              v-for="q in rejectedQueued"
              :key="q.id"
              class="desk-entries-rejected"
              data-testid="rejected-row"
            >
              <td class="desk-col--date">
                <span class="desk-row-lamp desk-row-lamp--critical" />{{ shortDay(q.input.date) }}
              </td>
              <td>
                <span class="desk-item">
                  <span class="desk-item-name">{{ q.input.description }}</span>
                  <span class="desk-status-word desk-status-word--critical"
                    >failed: {{ q.reason ?? 'unknown error' }}</span
                  >
                  <span class="desk-item-actions">
                    <Button variant="ghost" size="sm" @click="onRetryQueued(q.id)">Retry</Button>
                    <Button variant="ghost" size="sm" @click="onDiscardQueued(q.id)"
                      >Discard</Button
                    >
                  </span>
                </span>
              </td>
              <td class="desk-col--md">
                {{ q.input.categoryId ? (categoryNames[q.input.categoryId] ?? '—') : '—' }}
              </td>
              <td class="desk-col--amount">
                <span class="desk-amount-fig">{{
                  splitMoney(formatMoney(q.input.amount.minor, q.input.amount.currency)).figure
                }}</span
                >{{ ' ' }}<span class="desk-amount-code">{{ q.input.amount.currency }}</span>
              </td>
              <td class="desk-col--action"></td>
            </tr>
            <tr v-for="e in store.expenses" :key="e.id">
              <td class="desk-col--date">
                <span v-if="isRatePending(e)" class="desk-row-lamp desk-row-lamp--warn" />{{
                  shortDay(e.date)
                }}
              </td>
              <td>
                <span class="desk-item">
                  <span class="desk-item-name">{{ e.description }}</span>
                  <span class="desk-item-cat">{{
                    e.categoryId ? (categoryNames[e.categoryId] ?? e.categoryId) : '—'
                  }}</span>
                  <span v-if="isRatePending(e)" class="desk-status-word desk-status-word--warn"
                    >rate pending</span
                  >
                </span>
              </td>
              <td class="desk-col--md">
                {{ e.categoryId ? (categoryNames[e.categoryId] ?? e.categoryId) : '—' }}
              </td>
              <td class="desk-col--amount" data-testid="entry-amount">
                <span class="desk-amount-fig">{{ entryMoney(e).figure }}</span
                >{{ ' ' }}<span class="desk-amount-code">{{ entryMoney(e).code }}</span>
              </td>
              <td class="desk-col--action">
                <Button
                  variant="ghost"
                  class="desk-row-action"
                  aria-label="Edit"
                  title="Edit"
                  @click="openEdit(e)"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 14h3l8-8-3-3-8 8z" stroke-width="1.5" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  class="desk-row-action"
                  aria-label="Delete"
                  title="Delete"
                  @click="onDelete(e.id, e.description)"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 4h10M6 4V2h4v2M4.5 4l.5 10h6l.5-10" stroke-width="1.5" />
                  </svg>
                </Button>
              </td>
            </tr>
          </DataTable>
        </PanelFrame>
      </div>
    </template>

    <Dialog
      :open="showDialog"
      :title="editing ? 'Edit expense' : 'Add expense'"
      placement="sheet"
      @close="showDialog = false"
    >
      <ExpenseForm :expense="editing ?? undefined" @saved="onSaved" @cancel="showDialog = false" />
    </Dialog>
  </main>
</template>

<style scoped>
.desk-sr-only {
  position: absolute;
  font-size: var(--text-md);
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Centred in the content column, on the same gutters as the header (DESIGN.md Layout). */
.desk-month-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.desk-month-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.desk-month-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.desk-month-chevron {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.desk-month-label {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-md);
}
.desk-month-view-pending {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-warn);
}
.desk-undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-raised);
  font-size: var(--text-sm);
}
.desk-pending-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-warn);
}
.desk-entries-pending,
.desk-entries-rejected {
  background: var(--color-surface);
}
/* Tiles wrap by their own width; the hero and the forecast tile keep their sizes by content. */
.desk-month-view-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}
/* Categories and Entries side by side while both fit, one column on a phone. */
.desk-month-view-columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
}
.desk-month-view-columns > :deep(.desk-panel-categories) {
  flex: 1 1 380px;
  min-width: 0;
}
.desk-month-view-columns > :deep(.desk-panel-entries) {
  /* Grows faster than Categories so the item column keeps the width long names need. */
  flex: 1.6 1 460px;
  min-width: 0;
}
.desk-month-view-pad {
  padding: var(--space-2) var(--space-4);
}
.desk-month-view-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-2) var(--space-4);
}
@media (min-width: 768px) {
  .desk-month-view {
    padding-top: var(--space-6);
  }
}
</style>
