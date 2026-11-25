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
      <p>
        Sunrise <span class="desk-sunrise-num">{{ hhmm(figures.sunrise) }}</span>
      </p>
      <p>
        Sunset <span class="desk-sunrise-num">{{ hhmm(figures.sunset) }}</span>
      </p>
    </template>
    <p>
      Day length <span class="desk-sunrise-num">{{ length }}</span>
    </p>
    <p class="desk-sunrise-meta">{{ figures.attribution }}</p>
  </div>
</template>

<style scoped>
.desk-sunrise {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-sunrise p {
  margin: 0;
}
.desk-sunrise-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-sunrise-meta {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
</style>
