<script setup lang="ts">
/** Forecasted month-end total, with the basis text explaining what it accounts for
 * (spend so far, remaining fixed budgets, variable run-rate — or which of those is missing). */
import { onMounted, ref, watch } from 'vue';
import type { ForecastSummaryT } from '@desk/contracts';
import { PanelFrame, Tile } from '@desk/ui';
import { apiFetch } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { toPanelErrorKind, type PanelErrorKind } from '../utils/errors.js';

const props = defineProps<{ month: string }>();

const forecast = ref<ForecastSummaryT | null>(null);
const loading = ref(false);
const errorKind = ref<PanelErrorKind | null>(null);

async function load() {
  loading.value = true;
  errorKind.value = null;
  try {
    forecast.value = await apiFetch<ForecastSummaryT>(
      `/summary/forecast?month=${encodeURIComponent(props.month)}`,
    );
  } catch (err) {
    errorKind.value = toPanelErrorKind(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.month, load);

defineExpose({ load });
</script>

<template>
  <Tile
    data-testid="forecast-tile"
    label="Forecast"
    :loading="loading"
    :value="!loading && forecast ? formatMoney(forecast.forecast, forecast.currency) : undefined"
    :note="forecast ? `Based on: ${forecast.basis.join(', ')}.` : undefined"
  >
    <PanelFrame v-if="errorKind" kind="error" :code="errorKind" />
  </Tile>
</template>
