<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { YearSummaryT } from '@desk/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  PanelFrame,
  Skeleton,
  Tile,
  YearBars,
  type YearBarData,
} from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney, formatMonth } from '../utils/format.js';
import MonthCompare from '../components/MonthCompare.vue';

const router = useRouter();
const summary = ref<YearSummaryT | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const year = ref(String(new Date().getFullYear()));
let loadSeq = 0;

async function load() {
  // Same stale-response race as MonthView's month switching: rapid prev/next year clicks fire
  // overlapping requests, and a slower earlier one resolving later must not clobber the result
  // of a faster, more recent one.
  const seq = ++loadSeq;
  loading.value = true;
  error.value = null;
  try {
    const res = await apiFetch<YearSummaryT>(`/summary/year?year=${year.value}`);
    if (seq !== loadSeq) return;
    summary.value = res;
  } catch (err) {
    if (seq !== loadSeq) return;
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

onMounted(load);

function shiftYear(delta: number) {
  year.value = String(Number(year.value) + delta);
  load();
}

const total = computed(() => summary.value?.months.reduce((acc, m) => acc + m.spent, 0) ?? 0);

// Average over the months that had any spend, so a part-way year is not dragged down by empty months.
const spendMonths = computed(() => summary.value?.months.filter((m) => m.spent > 0).length ?? 0);
const average = computed(() =>
  spendMonths.value ? Math.round(total.value / spendMonths.value) : 0,
);
const highest = computed(() =>
  summary.value?.months.reduce<YearSummaryT['months'][number] | null>(
    (best, m) => (m.spent > 0 && (!best || m.spent > best.spent) ? m : best),
    null,
  ),
);
const monthName = (month: string) =>
  new Date(2000, Number(month.slice(5)) - 1, 1).toLocaleString('en-GB', { month: 'short' });

const bars = computed<YearBarData[]>(
  () =>
    summary.value?.months.map((m) => ({ month: m.month, spent: m.spent, budgeted: m.budgeted })) ??
    [],
);

function onSelectMonth(month: string) {
  router.push({ name: 'home', query: { month } });
}
</script>

<template>
  <main class="desk-year-view">
    <!-- The year switcher lives in the top bar, as the month switcher does. Deferred so the bar may
         mount after this view. -->
    <Teleport to="#top-bar-actions" defer>
      <div class="desk-year-switcher">
        <Button variant="secondary" aria-label="Previous year" @click="shiftYear(-1)">
          <svg class="desk-year-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </Button>
        <span class="desk-year-label">{{ year }}</span>
        <Button variant="secondary" aria-label="Next year" @click="shiftYear(1)">
          <svg class="desk-year-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </Button>
      </div>
    </Teleport>

    <Skeleton v-if="loading" height="14rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <template v-else-if="summary">
      <EmptyState v-if="total === 0" title="No expenses this year" />
      <template v-else>
        <div class="desk-year-view-stats">
          <Tile label="Year total" :value="formatMoney(total, summary.currency)" primary />
          <Tile
            label="Monthly average"
            :value="formatMoney(average, summary.currency)"
            :note="`Over ${spendMonths} ${spendMonths === 1 ? 'month' : 'months'} with spend`"
          />
          <Tile
            v-if="highest"
            label="Highest month"
            :value="monthName(highest.month)"
            :note="formatMoney(highest.spent, summary.currency)"
          />
        </div>
        <PanelFrame heading="Month by month">
          <YearBars
            :months="bars"
            :currency="summary.currency"
            :format-money="(m) => formatMoney(m, summary!.currency)"
            :format-month="(m) => formatMonth(m)"
            @select="onSelectMonth"
          />
        </PanelFrame>
        <MonthCompare />
      </template>
    </template>
  </main>
</template>

<style scoped>
.desk-year-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.desk-year-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.desk-year-chevron {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.desk-year-label {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-md);
}
.desk-year-view-stats {
  display: grid;
  gap: var(--space-4);
}
@media (min-width: 768px) {
  .desk-year-view-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
