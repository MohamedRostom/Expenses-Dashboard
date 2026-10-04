<script setup lang="ts">
import { ref, watch } from 'vue';
import { Dialog, Button, EmptyState } from '@desk/ui';
import type { WidgetCreateT, WidgetKindT, WidgetTypeT } from '@desk/contracts';
import { ApiError } from '../../api/client.js';
import { CURRENCY_CAP } from '@desk/core';
import CurrencyPicker from './CurrencyPicker.vue';
import PlacePicker from './PlacePicker.vue';
import PanelState from '../PanelState.vue';
import type { PanelErrorKind } from '../../utils/errors.js';

const props = defineProps<{
  open: boolean;
  types: WidgetTypeT[];
  /** Set when the catalogue fetch failed: shown by code instead of the empty state. */
  typesError?: PanelErrorKind | null;
  /** True when the user has a weather widget: sunrise then borrows its place. */
  hasWeather: boolean;
  /** Adds the widget; rejects with the server's error, shown here. */
  add: (body: WidgetCreateT) => Promise<void>;
}>();
defineEmits<{ close: [] }>();

const configuring = ref<WidgetKindT | null>(null);
const codes = ref<string[]>([]);
const error = ref('');

watch(
  () => props.open,
  () => {
    configuring.value = null;
    codes.value = [];
    error.value = '';
  },
);

async function submit(body: WidgetCreateT) {
  error.value = '';
  try {
    await props.add(body);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to add widget.';
  }
}

function choose(kind: WidgetKindT) {
  error.value = '';
  if (kind === 'currency' || kind === 'weather' || (kind === 'sunrise' && !props.hasWeather)) {
    configuring.value = kind;
  } else {
    void submit({ kind });
  }
}

function toggle(code: string) {
  codes.value = codes.value.includes(code)
    ? codes.value.filter((c) => c !== code)
    : codes.value.length < CURRENCY_CAP
      ? [...codes.value, code]
      : codes.value;
}

// A static example per kind, so the catalogue shows what a widget looks like before adding it.
const PREVIEW: Record<WidgetKindT, string> = {
  currency: '£1 = €1.17  +0.2% today',
  weather: '14°  Light rain  H 16° L 9°',
  sunrise: 'Sunrise 06:58  Sunset 18:21',
  spend_pace: '62% of budget, 9 days left',
  fixed_costs: '3 fixed costs still to pay',
};
</script>

<template>
  <Dialog :open="open" title="Add widget" @close="$emit('close')">
    <div v-if="configuring">
      <CurrencyPicker v-if="configuring === 'currency'" :chosen="codes" @toggle="toggle" />
      <PlacePicker v-else @select="(place) => submit({ kind: configuring!, place })" />
      <div class="desk-add-widget-actions">
        <Button variant="secondary" @click="configuring = null">Back</Button>
        <Button
          v-if="configuring === 'currency'"
          :disabled="codes.length === 0"
          @click="submit({ kind: 'currency', settings: { currencies: codes } })"
        >
          Add widget
        </Button>
      </div>
    </div>
    <PanelState v-else-if="typesError" kind="error" :code="typesError" />
    <EmptyState
      v-else-if="!types.some((x) => x.enabled)"
      title="No widgets available yet"
      description="New widget types appear here as they are switched on."
    />
    <ul v-else class="desk-add-widget-list">
      <li v-for="t in types.filter((x) => x.enabled)" :key="t.kind" class="desk-add-widget-item">
        <div>
          <p class="desk-add-widget-name">{{ t.name }}</p>
          <p class="desk-add-widget-desc">{{ t.description }}</p>
          <p class="desk-add-widget-preview" aria-label="Example">{{ PREVIEW[t.kind] }}</p>
        </div>
        <Button @click="choose(t.kind)">Add</Button>
      </li>
    </ul>
    <p v-if="error" role="alert">{{ error }}</p>
  </Dialog>
</template>

<style scoped>
.desk-add-widget-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.desk-add-widget-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.desk-add-widget-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.desk-add-widget-name {
  margin: 0;
  font-weight: 600;
}
.desk-add-widget-desc {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}
.desk-add-widget-preview {
  margin: 0.2rem 0 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  opacity: 0.7;
}
</style>
