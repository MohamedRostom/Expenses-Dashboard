<script setup lang="ts">
/** Forecasted month-end total, with the basis text explaining what it accounts for
 * (spend so far, remaining fixed budgets, variable run-rate — or which of those is missing). */
import { onMounted, ref, watch } from 'vue';
import type { ForecastSummaryT } from '@desk/contracts';
import { Skeleton } from '@desk/ui';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney } from '../utils/format.js';

const props = defineProps<{ month: string }>();

const forecast = ref<ForecastSummaryT | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    forecast.value = await apiFetch<ForecastSummaryT>(
      `/summary/forecast?month=${encodeURIComponent(props.month)}`,
    );
  } catch (err) {
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.month, load);

defineExpose({ load });
</script>

<template>
  <div class="desk-forecast-tile" data-testid="forecast-tile">
    <Skeleton v-if="loading" height="4rem" />
    <template v-else-if="forecast">
      <span class="desk-tile-label">Forecast</span>
      <span class="desk-tile-value">{{ formatMoney(forecast.forecast, forecast.currency) }}</span>
      <p class="desk-forecast-basis">Based on: {{ forecast.basis.join(', ') }}.</p>
    </template>
  </div>
</template>

<style scoped>
.desk-forecast-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--color-fg);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  max-width: 20rem;
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
.desk-forecast-basis {
  font-size: 0.75rem;
  opacity: 0.7;
  margin: 0;
}
</style>
