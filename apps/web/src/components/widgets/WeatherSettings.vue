<script setup lang="ts">
import { ref } from 'vue';
import type { PlaceCandidateT, TemperatureUnitT, WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';
import PlacePicker from './PlacePicker.vue';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';
import PanelState from '../PanelState.vue';

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
    <PanelState v-if="error" kind="error" :code="error" />
  </div>
</template>

<style scoped>
.desk-weather-settings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.desk-weather-unit {
  border: 0;
  margin: 0;
  padding: 0;
}
</style>
