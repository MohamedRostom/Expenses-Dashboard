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
import { formatMoney } from '../utils/format.js';
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
    <header class="desk-year-view-header">
      <h1>Year</h1>
      <div class="desk-year-switcher">
        <Button variant="secondary" aria-label="Previous year" @click="shiftYear(-1)">‹</Button>
        <span class="desk-year-label">{{ year }}</span>
        <Button variant="secondary" aria-label="Next year" @click="shiftYear(1)">›</Button>
      </div>
    </header>

    <Skeleton v-if="loading" height="14rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <template v-else-if="summary">
      <Tile
        class="desk-year-view-total"
        label="Year total"
        :value="formatMoney(total, summary.currency)"
        primary
      />

      <EmptyState v-if="total === 0" title="No expenses this year" />
      <template v-else>
        <PanelFrame heading="Month by month">
          <YearBars
            :months="bars"
            :currency="summary.currency"
            :format-money="(m) => formatMoney(m, summary!.currency)"
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
.desk-year-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.desk-year-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.desk-year-label {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-year-view-total {
  max-width: 20rem;
}
</style>
