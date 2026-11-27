<script setup lang="ts">
/** Forecasted month-end total, with the basis text explaining what it accounts for
 * (spend so far, remaining fixed budgets, variable run-rate — or which of those is missing). */
import { computed, onMounted, ref, watch } from 'vue';
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

const BASIS_WORDS: Record<string, string> = {
  'spend to date': 'what you have spent so far',
  'no spend yet': 'what you have spent so far',
  'remaining fixed-kind budgets': 'fixed budgets still to come',
  'no fixed-kind budgets': 'fixed budgets still to come',
  'variable run-rate': 'your average daily variable spend for the days left',
  'no variable spend history yet': 'no variable spend history yet',
};
/** Plain-language note built from forecast.basis; unknown strings pass through as they are. */
const note = computed(() => {
  if (!forecast.value) return undefined;
  const parts = [...new Set(forecast.value.basis.map((b) => BASIS_WORDS[b] ?? b))];
  const last = parts.pop();
  return `Based on ${parts.length ? `${parts.join(', ')} and ` : ''}${last ?? 'nothing yet'}.`;
});

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
    :note="note"
  >
    <PanelFrame v-if="errorKind" kind="error" :code="errorKind" />
  </Tile>
</template>
