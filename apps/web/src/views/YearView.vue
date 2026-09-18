<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { YearSummaryT } from '@desk/contracts';
import { EmptyState, ErrorState, Skeleton, YearBars, type YearBarData } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import MonthCompare from '../components/MonthCompare.vue';

const router = useRouter();
const summary = ref<YearSummaryT | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const year = ref(String(new Date().getFullYear()));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    summary.value = await apiFetch<YearSummaryT>(`/summary/year?year=${year.value}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    loading.value = false;
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
      <div class="desk-year-switcher">
        <button type="button" aria-label="Previous year" @click="shiftYear(-1)">‹</button>
        <span class="desk-year-label">{{ year }}</span>
        <button type="button" aria-label="Next year" @click="shiftYear(1)">›</button>
      </div>
    </header>

    <Skeleton v-if="loading" height="14rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <template v-else-if="summary">
      <div class="desk-year-view-total">
        <span class="desk-tile-label">Year total</span>
        <span class="desk-tile-value">{{ formatMoney(total, summary.currency) }}</span>
      </div>

      <EmptyState v-if="total === 0" title="No expenses this year" />
      <template v-else>
        <YearBars :months="bars" :currency="summary.currency" @select="onSelectMonth" />
        <MonthCompare />
      </template>
    </template>
  </main>
</template>

<style scoped>
.desk-year-view {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.desk-year-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.desk-year-switcher {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--font-mono);
}
.desk-year-switcher button {
  background: none;
  border: 1px solid var(--color-fg);
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-fg);
  padding: 0.25rem 0.6rem;
}
.desk-year-view-total {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  max-width: 14rem;
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
</style>
