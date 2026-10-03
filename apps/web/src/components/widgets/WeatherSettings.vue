<script setup lang="ts">
import { ref } from 'vue';
import type { PlaceCandidateT, TemperatureUnitT, WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';
import PlacePicker from './PlacePicker.vue';

const props = defineProps<{ widget: WidgetT; patch: (body: WidgetPatchT) => Promise<unknown> }>();
const store = useWidgetsStore();
const error = ref('');

async function choose(place: PlaceCandidateT) {
  error.value = '';
  try {
    await props.patch({ place });
  } catch {
    error.value = "Couldn't save that place.";
  }
}

async function setUnit(unit: TemperatureUnitT) {
  error.value = '';
  try {
    await store.setTemperatureUnit(unit);
  } catch {
    error.value = "Couldn't save that change.";
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
    <p v-if="error" role="alert">{{ error }}</p>
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
