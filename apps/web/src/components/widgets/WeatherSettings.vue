<script setup lang="ts">
import { PanelFrame } from '@desk/ui';
import { ref } from 'vue';
import type { PlaceCandidateT, TemperatureUnitT, WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';
import PlacePicker from './PlacePicker.vue';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';

const props = defineProps<{ widget: WidgetT; patch: (body: WidgetPatchT) => Promise<unknown> }>();
const store = useWidgetsStore();
const error = ref<PanelErrorKind | null>(null);

async function choose(place: PlaceCandidateT) {
  error.value = null;
  try {
    await props.patch({ place });
  } catch (err) {
    error.value = toPanelErrorKind(err);
  }
}

async function setUnit(unit: TemperatureUnitT) {
  error.value = null;
  try {
    await store.setTemperatureUnit(unit);
  } catch (err) {
    error.value = toPanelErrorKind(err);
  }
}
</script>

<template>
  <div class="desk-weather-settings">
    <p v-if="widget.place">Current place: {{ widget.place.name }}</p>
    <PlacePicker :previous="widget.place?.name" @select="choose" />
    <fieldset class="desk-weather-unit">
      <legend>Temperature unit</legend>
      <label v-for="u in ['C', 'F'] as const" :key="u">
        <input
          type="radio"
          name="temperature-unit"
          :value="u"
          :checked="store.temperatureUnit === u"
          @change="setUnit(u)"
        />
        °{{ u }}
      </label>
    </fieldset>
    <PanelFrame v-if="error" kind="error" :code="error" />
  </div>
</template>

<style scoped>
.desk-weather-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.desk-weather-unit {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  gap: var(--space-2);
}
.desk-weather-unit legend {
  margin-block-end: var(--space-2);
}
/* The native radio covers its whole label, so the focusable box meets the target minimum. */
.desk-weather-unit label {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--target-min);
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-weather-unit input {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.desk-weather-unit label:has(input:checked) {
  background: var(--color-accent);
  color: var(--color-accent-fg);
  border-color: var(--color-accent);
}
.desk-weather-unit label:has(input:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
</style>
