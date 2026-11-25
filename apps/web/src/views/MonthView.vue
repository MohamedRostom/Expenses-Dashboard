<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ExpenseResponseT, YearSummaryT } from '@desk/contracts';
import { spendPace } from '@desk/core';
import {
  Button,
  CategoryBars,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  PanelFrame,
  Select,
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
import { useSessionStore } from '../stores/session.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import { formatMoney, formatMonth } from '../utils/format.js';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ExpenseForm from '../components/ExpenseForm.vue';
import ForecastTile from '../components/ForecastTile.vue';
import ShortcutsDialog from '../components/ShortcutsDialog.vue';
import {
  estimatedTotal,
  list as listQueue,
  discard as discardQueued,
  flushWhenOnline as flushQueue,
  retry as retryQueued,
  type QueuedExpense,
} from '../offline/queue.js';

/** How long the undo banner stays after a delete. */
const UNDO_WINDOW_MS = 10_000;

const WidgetStrip = defineAsyncComponent(() => import('../components/widgets/WidgetStrip.vue'));

const route = useRoute();
const router = useRouter();
const store = useExpensesStore();
const session = useSessionStore();
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
/** Recently soft-deleted rows this session, key -> banner text and the ids to restore, so the undo
 * banner has something to show for a few seconds even though the rows are already gone from
 * store.expenses. A bulk delete is one key (one grouped banner). */
const recentlyDeleted = ref<Map<string, { text: string; ids: string[] }>>(new Map());
const showShortcuts = ref(false);
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

// The board hides the date column below 480 and the category column below 768 (DataTable), and a
// colspan wider than what shows would add phantom columns, so the rate row counts what is visible.
const visibleCols = ref(5); // all five columns until the queries are read
const colQueries: MediaQueryList[] = [];
function syncCols() {
  visibleCols.value = 3 + colQueries.filter((q) => q.matches).length;
}

onMounted(() => {
  if (typeof matchMedia === 'function')
    for (const w of [480, 768]) {
      const q = matchMedia(`(min-width: ${w}px)`);
      q.addEventListener('change', syncCols);
      colQueries.push(q);
    }
  syncCols();
  const month = typeof route.query.month === 'string' ? route.query.month : undefined;
  store.loadMonth(month);
  loadTrend();
  loadCategoryNames();
  loadQueue();
  window.addEventListener('online', onBackOnline);
});

onUnmounted(() => {
  for (const q of colQueries) q.removeEventListener('change', syncCols);
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

const monthLabel = computed(() => formatMonth(store.currentMonth));

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
  onHelp: () => (showShortcuts.value = true),
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

// Budgeted categories keep the bars; the rest sit in a closed group so a long unbudgeted tail
// does not bury them. The Table tab still lists every category.
const budgetedBars = computed(() => categoryBars.value.filter((c) => c.budget != null));
const unbudgetedBars = computed(() => categoryBars.value.filter((c) => c.budget == null));

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
// `deleting` keeps its value after close so the title does not blank while the dialog fades out.
const deleting = ref<{ ids: string[]; description: string } | null>(null);
const deleteOpen = ref(false);
const selected = ref<string[]>([]);
const deleteTitle = computed(() =>
  (deleting.value?.ids.length ?? 0) > 1
    ? `Delete ${deleting.value?.description}?`
    : `Delete "${deleting.value?.description ?? ''}"?`,
);
function askDelete(id: string, description: string) {
  deleting.value = { ids: [id], description };
  deleteOpen.value = true;
}
function askDeleteSelected() {
  deleting.value = {
    ids: [...selected.value],
    description: `${selected.value.length} entries`,
  };
  deleteOpen.value = true;
}
function offerUndo(key: string, text: string, ids: string[]) {
  // No action-button slot on Toast yet: a brief banner with a real Undo button, instead of
  // just a toast describing that undo exists somewhere.
  recentlyDeleted.value.set(key, { text, ids });
  setTimeout(() => recentlyDeleted.value.delete(key), UNDO_WINDOW_MS);
}
async function onDelete() {
  deleteOpen.value = false;
  if (!deleting.value) return;
  const { ids, description } = deleting.value;
  if (ids.length === 1) {
    try {
      await store.remove(ids[0]!);
      offerUndo(ids[0]!, `Deleted "${description}".`, ids);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to delete expense.', 'critical');
    }
    return;
  }
  // One at a time: the API has no bulk delete, and one failure should not stop the rest.
  const done: string[] = [];
  for (const id of ids) {
    try {
      await store.remove(id);
      done.push(id);
    } catch {
      // counted below
    }
  }
  selected.value = [];
  if (done.length > 0) offerUndo(`bulk-${done[0]}`, `Deleted ${done.length} entries.`, done);
  const failed = ids.length - done.length;
  if (failed > 0) toast.push(`${failed} could not be deleted`, 'critical');
}
async function onUndoDelete(key: string) {
  const ids = recentlyDeleted.value.get(key)?.ids ?? [];
  try {
    for (const id of ids) await store.restore(id);
    recentlyDeleted.value.delete(key);
    await store.loadMonth();
    toast.push(ids.length > 1 ? 'Entries restored' : 'Expense restored');
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
/** A row entered in another currency whose rate has arrived: shows what it was and how it converted. */
const isConverted = (e: ExpenseResponseT) =>
  e.currencyOriginal !== store.summary?.currency && !isRatePending(e);
const rateFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
/** What the row's own amount column does not say: the rate, the day it is from, and where it came from. */
function conversionLine(e: ExpenseResponseT) {
  const parts: string[] = [];
  if (e.rateToDefault)
    parts.push(
      `1 ${e.currencyOriginal} = ${rateFmt.format(Number(e.rateToDefault))} ${store.summary?.currency}`,
    );
  if (e.rateDate) parts.push(`rate of ${shortDay(e.rateDate)}`);
  if (e.rateOverridden) parts.push('manual rate');
  else if (e.rateSource && e.rateSource !== 'manual' && e.rateSource !== 'user')
    parts.push(e.rateSource === 'ecb' ? 'ECB' : e.rateSource);
  return parts.join(' · ');
}
/** A foreign amount whose rate has not arrived yet (the API leaves amountDefault empty). */
const isRatePending = (e: ExpenseResponseT) =>
  e.amountDefault === null && e.currencyOriginal !== store.summary?.currency;

// "Left this month" is the one Display figure (FR-011) and the one filled tile (ADR-0008). Over
// budget, the tile goes red with the word.
const budgeted = computed(() => (store.summary?.budgeted ?? 0) > 0);
const over = computed(() => budgeted.value && (store.summary?.remaining ?? 0) < 0);
const userZone = computed(
  () => session.user?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
);
/** The viewed month is the current one in the user's zone (days left only make sense then). */
const isThisMonth = computed(() => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: userZone.value,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return store.currentMonth === `${get('year')}-${get('month')}`;
});
// No "spent" in the hero's own words: e2e finds the Spent stat tile by that text.
const leftNote = computed(() => {
  if (!store.summary || !budgeted.value || !isThisMonth.value) return undefined;
  const pace = spendPace(
    { tiles: { spent: store.summary.spent } },
    [store.summary.budgeted],
    userZone.value,
    new Date(),
  );
  if (pace.dailyToBudgetMinor === null) return undefined;
  return `${fmt(pace.dailyToBudgetMinor)} a day for ${pace.daysLeft} ${pace.daysLeft === 1 ? 'day' : 'days'}`;
});
const greetingMonth = computed(() => {
  const [y, m] = store.currentMonth.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(y!, m! - 1, 1),
  );
});
// Days the average runs over: the elapsed days of the current month, the whole month otherwise.
const dailyAverage = computed(() => {
  if (!store.summary) return 0;
  const [y, m] = store.currentMonth.split('-').map(Number);
  const now = new Date();
  const isNow = now.getFullYear() === y && now.getMonth() === m! - 1;
  const days = isNow ? now.getDate() : new Date(y!, m!, 0).getDate();
  return Math.round(store.summary.spent / Math.max(1, days));
});
const categoryOf = (e: ExpenseResponseT) =>
  e.categoryId ? (categoryNames.value[e.categoryId] ?? e.categoryId) : '—';
const SHOWN = 8;
const showAll = ref(false);
const filterText = ref('');
const filterCategory = ref('');
const filterCategoryOptions = computed(() => [
  { value: '', label: 'All categories' },
  ...Object.entries(categoryNames.value).map(([value, label]) => ({ value, label })),
]);
const filteredExpenses = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  return store.expenses.filter(
    (e) =>
      (!q || e.description.toLowerCase().includes(q)) &&
      (!filterCategory.value || e.categoryId === filterCategory.value),
  );
});
const shownExpenses = computed(() =>
  showAll.value ? filteredExpenses.value : filteredExpenses.value.slice(0, SHOWN),
);
const catTab = ref('bars');
const catTabs = [
  { id: 'bars', label: 'Bars' },
  { id: 'table', label: 'Table' },
];
const chartTab = ref('chart');
const chartTabs = [
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
];
const overList = computed(() =>
  categoryBars.value.filter((c) => c.budget != null && c.spent > c.budget),
);
const overCategories = computed(() => overList.value.length);
const overBy = computed(() => overList.value.reduce((t, c) => t + c.spent - (c.budget ?? 0), 0));
const budgetedCategories = computed(
  () => categoryBars.value.filter((c) => c.budget != null).length,
);
const categoriesWord = (n: number) => (n === 1 ? 'category' : 'categories');
const spentStatus = computed(() => {
  const pending = store.summary?.pendingRates ?? 0;
  return pending > 0 ? [{ text: `${pending} rate pending`, tone: 'warn' as const }] : [];
});

const trendColumns: BoardColumn[] = [
  { key: 'month', label: 'Month' },
  { key: 'spent', label: 'Spent', align: 'end', width: 'amount' },
];

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
    <div v-for="[key, entry] in recentlyDeleted" :key="key" class="desk-undo-banner" role="status">
      <span>{{ entry.text }}</span>
      <Button variant="ghost" size="sm" @click="onUndoDelete(key)">Undo</Button>
    </div>
    <header class="desk-month-view-hello">
      <div class="desk-month-view-greeting">
        <p class="desk-month-view-hello-title">Good morning</p>
        <p>Here's your spending overview for {{ greetingMonth }}.</p>
        <span
          v-if="pendingQueued.length > 0"
          class="desk-pending-badge"
          data-testid="pending-count"
        >
          {{ pendingQueued.length }} pending
        </span>
      </div>
    </header>
    <!-- The switcher and Add live in the top bar (state stays here). Deferred so the bar may mount
         after this view. -->
    <Teleport to="#top-bar-actions" defer>
      <div class="desk-month-switcher">
        <Button
          variant="secondary"
          aria-label="Previous month"
          aria-keyshortcuts="["
          title="Previous month ([)"
          @click="shiftMonth(-1)"
        >
          <svg class="desk-month-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </Button>
        <span class="desk-month-label">{{ monthLabel }}</span>
        <Button
          variant="secondary"
          aria-label="Next month"
          aria-keyshortcuts="]"
          title="Next month (])"
          @click="shiftMonth(1)"
        >
          <svg class="desk-month-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </Button>
      </div>
      <Button class="desk-topbar-add" aria-keyshortcuts="n" title="Add expense (n)" @click="openAdd"
        >Add expense <kbd class="desk-key-hint" aria-hidden="true">n</kbd></Button
      >
    </Teleport>
    <!-- Mounts once the first month load settles, also when that load failed (e.g. offline), so
         cached widget figures show (spec edge case "app is offline"). -->
    <WidgetStrip v-if="settled" />

    <Skeleton v-if="store.loading" height="12rem" />
    <!-- A pending/rejected queue is IndexedDB-backed, independent of the failed network summary
         fetch (store.error) — e.g. offline.spec.ts adds an expense while offline, where
         store.loadMonth() necessarily fails. Falling through to the full-page ErrorState would
         hide the queue the offline feature exists to show, so only show it when there's truly
         nothing else to render. -->
    <template v-else-if="store.error && pendingQueued.length === 0 && rejectedQueued.length === 0">
      <ErrorState :code="store.error ?? undefined">
        <template #action>
          <Button variant="secondary" @click="store.loadMonth(store.currentMonth)">Retry</Button>
        </template>
      </ErrorState>
    </template>
    <template v-else-if="store.summary || pendingQueued.length > 0 || rejectedQueued.length > 0">
      <template v-if="store.summary">
        <div class="desk-month-view-bento">
          <Tile
            class="desk-tile desk-tile--primary"
            primary
            :words="!budgeted"
            :label="over ? 'Over budget this month' : 'Left this month'"
            :value="budgeted ? fmt(store.summary.remaining) : 'No budget set'"
            :variant="over ? 'critical' : 'default'"
            :note="leftNote"
            :status="
              over
                ? [{ text: `${fmt(-store.summary.remaining)} over the budget`, tone: 'critical' }]
                : []
            "
          >
            <template #action>
              <RouterLink v-if="!budgeted" to="/settings/categories">Set a budget</RouterLink>
            </template>
          </Tile>
          <div class="desk-month-view-stats">
            <Tile
              class="desk-tile"
              label="Spent this month"
              :value="fmt(store.summary.spent)"
              note="Total expenses"
              :status="spentStatus"
            />
            <Tile
              class="desk-tile"
              label="Daily average"
              :value="fmt(dailyAverage)"
              note="Per day this month"
            />
            <Tile
              class="desk-tile"
              label="Entries"
              :value="String(store.expenses.length)"
              note="Expenses logged"
            />
            <Tile
              class="desk-tile"
              label="Over budget"
              :value="`${overCategories} ${categoriesWord(overCategories)}`"
              :variant="overCategories > 0 ? 'critical' : 'default'"
              :note="`Of ${budgetedCategories} with a budget`"
            />
          </div>
        </div>
        <p
          v-if="estimatedPending > 0"
          class="desk-month-view-pending"
          data-testid="estimated-pending"
        >
          + {{ fmt(estimatedPending) }} estimated, not yet synced
        </p>
      </template>

      <EmptyState
        v-if="
          store.expenses.length === 0 && pendingQueued.length === 0 && rejectedQueued.length === 0
        "
        title="No expenses this month"
        description="Add one to get started."
      />
      <div v-else class="desk-month-view-columns">
        <PanelFrame heading="Recent entries" data-panel="entries" class="desk-panel-entries">
          <div class="desk-entries-tools">
            <Input v-model="filterText" variant="search" label="Filter entries" />
            <Select v-model="filterCategory" label="Category" :options="filterCategoryOptions" />
            <Button
              v-if="selected.length > 0"
              variant="danger"
              class="desk-entries-bulk"
              @click="askDeleteSelected"
              >Delete selected ({{ selected.length }})</Button
            >
          </div>
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
                  <span class="desk-item-date desk-item-date--solo">{{
                    shortDay(q.input.date)
                  }}</span>
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
                  <span class="desk-item-date desk-item-date--solo">{{
                    shortDay(q.input.date)
                  }}</span>
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
            <tr v-if="filteredExpenses.length === 0" class="desk-entries-none">
              <td colspan="5">No entries match</td>
            </tr>
            <template v-for="e in shownExpenses" :key="e.id">
              <tr
                :class="{
                  'desk-entries-converted': isConverted(e),
                  'desk-entries-has-rate': isConverted(e),
                }"
              >
                <td class="desk-col--date">
                  <span v-if="isRatePending(e)" class="desk-row-lamp desk-row-lamp--warn" />{{
                    shortDay(e.date)
                  }}
                </td>
                <td>
                  <span class="desk-item desk-item--meta">
                    <span class="desk-item-line">
                      <label class="desk-entries-check-wrap">
                        <input
                          v-model="selected"
                          type="checkbox"
                          class="desk-entries-check"
                          :value="e.id"
                          :aria-label="`Select ${e.description}`"
                        />
                        <span class="desk-entries-box" aria-hidden="true" />
                      </label>
                      <span
                        class="desk-item-name"
                        :title="e.description"
                        :aria-describedby="isConverted(e) ? `rate-${e.id}` : undefined"
                        >{{ e.description }}</span
                      >
                    </span>
                    <span class="desk-item-date">{{ shortDay(e.date) }}</span>
                    <span class="desk-item-cat" :title="categoryOf(e)">{{ categoryOf(e) }}</span>
                    <span v-if="isRatePending(e)" class="desk-status-word desk-status-word--warn"
                      >rate pending</span
                    >
                  </span>
                </td>
                <td class="desk-col--md" :title="categoryOf(e)">
                  {{ categoryOf(e) }}
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
                    @click="askDelete(e.id, e.description)"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 4h10M6 4V2h4v2M4.5 4l.5 10h6l.5-10" stroke-width="1.5" />
                    </svg>
                  </Button>
                </td>
              </tr>
              <!-- The rate gets the whole row so it reads in full; the entry's checkbox and actions stay
                 above, and the name's aria-describedby points here. -->
              <tr v-if="isConverted(e)" class="desk-entries-converted desk-entries-rate-row">
                <td :colspan="visibleCols">
                  <span :id="`rate-${e.id}`" class="desk-item-rate">{{ conversionLine(e) }}</span>
                </td>
              </tr>
            </template>
          </DataTable>
          <div v-if="filteredExpenses.length > SHOWN" class="desk-month-view-more">
            <span class="desk-month-view-more-note"
              >Showing {{ shownExpenses.length }} of {{ filteredExpenses.length }} entries</span
            >
            <Button variant="secondary" @click="showAll = !showAll">{{
              showAll ? 'Show recent only' : `View all ${filteredExpenses.length} entries`
            }}</Button>
          </div>
        </PanelFrame>

        <div class="desk-month-view-side">
          <PanelFrame
            v-if="trendPoints.length > 1"
            heading="Spend by month"
            data-panel="chart"
            data-testid="trend-sparkline"
          >
            <div class="desk-month-view-pad">
              <Tabs v-model="chartTab" :tabs="chartTabs" label="Spend by month view">
                <template #chart><TrendSparkline :points="trendPoints" /></template>
                <template #table>
                  <DataTable :columns="trendColumns" caption="Spend by month" dense>
                    <tr v-for="p in trendPoints" :key="p.month">
                      <td>{{ p.month }}</td>
                      <td class="desk-col--amount">{{ fmt(p.spent) }}</td>
                    </tr>
                  </DataTable>
                </template>
              </Tabs>
            </div>
          </PanelFrame>
          <ForecastTile v-if="store.summary" :month="store.currentMonth" />
          <PanelFrame
            v-if="store.summary"
            heading="Category budgets"
            data-panel="categories"
            class="desk-panel-categories"
          >
            <div class="desk-month-view-bars">
              <p
                v-if="overCategories > 0"
                class="desk-month-view-alert"
                role="status"
                data-testid="over-banner"
              >
                {{ overCategories }} {{ categoriesWord(overCategories) }} over budget,
                {{ fmt(overBy) }} over in total
              </p>
              <Tabs v-model="catTab" :tabs="catTabs" label="Category view">
                <template #bars>
                  <CategoryBars
                    v-if="budgetedBars.length > 0"
                    :categories="budgetedBars"
                    :currency="store.summary.currency"
                    :format-money="fmt"
                  />
                  <p v-if="budgetedBars.length === 0" class="desk-month-view-nobudget">
                    No budgets yet.
                    <RouterLink to="/settings/categories">Set a budget</RouterLink>
                  </p>
                  <details v-if="unbudgetedBars.length > 0" class="desk-month-view-unbudgeted">
                    <summary>
                      {{ unbudgetedBars.length }}
                      {{ categoriesWord(unbudgetedBars.length) }} without a budget
                    </summary>
                    <CategoryBars
                      :categories="unbudgetedBars"
                      :currency="store.summary.currency"
                      :format-money="fmt"
                    />
                  </details>
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
        </div>
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
    <ConfirmDialog
      :open="deleteOpen"
      :title="deleteTitle"
      confirm-label="Delete"
      @confirm="onDelete"
      @cancel="deleteOpen = false"
    >
      <p>It moves to the Bin, where you can restore it.</p>
    </ConfirmDialog>
    <ShortcutsDialog :open="showShortcuts" @close="showShortcuts = false" />
  </main>
</template>

<style scoped>
/* Centred in the content column, on the page gutters every screen keeps for itself (the shell only
   insets for the sidebar and bottom bar). */
.desk-month-view {
  max-width: 1160px;
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.desk-month-view-hello {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.desk-month-view-greeting .desk-month-view-hello-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: var(--tracking-tight);
}
.desk-month-view-greeting p {
  margin: var(--space-1) 0 var(--space-3);
}
.desk-month-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* The bottom bar carries Add below 1024px (the n shortcut works at every width). */
@media (max-width: 1023px) {
  .desk-topbar-add {
    display: none;
  }
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
/* Rows entered in another currency: a quiet accent tint; the second line says it in words too. */
.desk-entries-converted {
  background: var(--color-row-converted);
}
/* The pair shares the tint with no rule between: the entry row drops its bottom line. */
tr.desk-entries-has-rate > td {
  border-bottom: 0;
}
tr.desk-entries-rate-row > td {
  height: auto;
  padding-block: 0 var(--space-2);
  padding-inline: var(--space-3);
}
.desk-item-rate {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-key-hint {
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border: 1px solid currentColor;
  border-radius: var(--radius-field);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  opacity: 0.8;
}
.desk-entries-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.desk-entries-tools > * {
  flex: 1 1 10rem;
}
.desk-entries-tools > .desk-entries-bulk {
  flex: 0 0 auto;
}
.desk-entries-none td {
  color: var(--color-fg-muted);
}
.desk-item-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
/* The input is the target (44px on phones, 24px, the WCAG 2.2 minimum, from 1024): transparent and
   as big as its label. The visible box (20px) is drawn by the span after it. The negative margins keep
   the row height. */
.desk-entries-check-wrap {
  position: relative;
  flex: none;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  margin: calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-2));
  cursor: pointer;
}
.desk-entries-check {
  appearance: none;
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.desk-entries-box {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  display: grid;
  place-content: center;
  inline-size: var(--space-5);
  block-size: var(--space-5);
  translate: -50% -50%;
  border: 1px solid color-mix(in srgb, currentcolor 45%, var(--color-border));
  border-radius: var(--radius-sm);
  background: transparent;
  pointer-events: none;
}
.desk-entries-check:checked + .desk-entries-box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.desk-entries-check:checked + .desk-entries-box::after {
  content: '';
  inline-size: var(--space-2);
  block-size: var(--space-1);
  margin-block-start: calc(-1 * var(--space-1) / 2);
  border-inline-start: 2px solid var(--color-accent-fg);
  border-block-end: 2px solid var(--color-accent-fg);
  transform: rotate(-45deg);
}
.desk-entries-check:focus-visible + .desk-entries-box {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
@media (min-width: 1024px) {
  .desk-entries-check-wrap {
    inline-size: var(--space-6);
    block-size: var(--space-6);
    margin: 0;
  }
}
.desk-month-view-nobudget {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
}
.desk-month-view-unbudgeted > summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
}
/* A chevron that turns when the group opens (the native marker is replaced, so it is drawn here). */
.desk-month-view-unbudgeted > summary::before {
  content: '';
  flex: none;
  inline-size: var(--space-2);
  block-size: var(--space-2);
  border-inline-end: 2px solid currentcolor;
  border-block-end: 2px solid currentcolor;
  transform: rotate(-45deg);
}
.desk-month-view-unbudgeted[open] > summary::before {
  transform: rotate(45deg);
}
.desk-month-view-unbudgeted > summary::-webkit-details-marker {
  display: none;
}
.desk-month-view-unbudgeted > summary:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
/* One column at 360; the hero beside the 2x2 stat tiles from 768; entries beside the chart and
   category budgets column from 1024 (ADR-0008). */
.desk-month-view-bento,
.desk-month-view-columns {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: minmax(0, 1fr);
}
/* The hero stretches over both stat rows: label on top, figure and note at the bottom. */
.desk-tile--primary :deep(.desk-tile-value) {
  margin-block-start: auto;
}
.desk-month-view-stats {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.desk-month-view-side {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.desk-month-view-columns > :deep(.desk-panel-entries) {
  min-width: 0;
}
.desk-month-view-alert {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-field);
  background: color-mix(in srgb, var(--color-critical) 12%, transparent);
  color: var(--color-critical);
  font-size: var(--text-sm);
  font-weight: 600;
}
.desk-month-view-more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.desk-month-view-more-note {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
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
  .desk-month-view-bento {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
  }
}
@media (min-width: 1024px) {
  .desk-month-view-columns {
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    align-items: start;
  }
}
</style>
