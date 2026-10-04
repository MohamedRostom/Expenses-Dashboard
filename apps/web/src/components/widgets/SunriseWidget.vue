<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetT } from '@desk/contracts';

const props = defineProps<{
  figures: NonNullable<Extract<WidgetT, { kind: 'sunrise' }>['figures']>;
}>();

// Times arrive already in the place's zone ("YYYY-MM-DDTHH:MM"); show them as given, never convert.
const hhmm = (s: string) => s.slice(11, 16);
const length = computed(() => {
  const mins = Math.round(props.figures.daylightSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
});
</script>

<template>
  <div class="desk-sunrise">
    <p class="desk-sunrise-place">
      {{ figures.place }}<span v-if="figures.showZone"> · {{ figures.placeTimeZone }}</span>
    </p>
    <p v-if="figures.polar === 'day'">Sun up all day</p>
    <p v-else-if="figures.polar === 'night'">Sun down all day</p>
    <template v-else-if="figures.sunrise && figures.sunset">
      <p class="desk-sunrise-num">Sunrise {{ hhmm(figures.sunrise) }}</p>
      <p class="desk-sunrise-num">Sunset {{ hhmm(figures.sunset) }}</p>
    </template>
    <p class="desk-sunrise-num">Day length {{ length }}</p>
    <p class="desk-sunrise-meta">{{ figures.attribution }}</p>
  </div>
</template>

<style scoped>
.desk-sunrise p {
  margin: 0.15rem 0;
}
.desk-sunrise-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-sunrise-meta {
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
