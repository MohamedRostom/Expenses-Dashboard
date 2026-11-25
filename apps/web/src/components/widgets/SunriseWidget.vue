<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetT } from '@desk/contracts';
import { daylightFraction, duration, nextSunEvent } from './widget-summary.js';

const props = defineProps<{
  figures: NonNullable<Extract<WidgetT, { kind: 'sunrise' }>['figures']>;
  /** Now as "YYYY-MM-DDTHH:MM" wall time in the place's zone (the strip ticks it each minute). */
  now: string;
}>();

// Times arrive already in the place's zone ("YYYY-MM-DDTHH:MM"); show them as given, never convert.
const hhmm = (s: string) => s.slice(11, 16);
const length = computed(() => duration(Math.round(props.figures.daylightSeconds / 60)));
const next = computed(() => nextSunEvent(props.figures, props.now));
const fraction = computed(() => daylightFraction(props.figures, props.now));
// A half-ellipse from sunrise (left) to sunset (right); the dot sits at the time of day.
const dot = computed(() => {
  const a = Math.PI * (1 - fraction.value);
  return { x: 50 + 44 * Math.cos(a), y: 28 - 24 * Math.sin(a) };
});
</script>

<template>
  <div class="desk-sunrise">
    <p v-if="figures.showZone" class="desk-sunrise-meta">{{ figures.placeTimeZone }}</p>
    <p v-if="figures.polar === 'day'">Sun up all day</p>
    <p v-else-if="figures.polar === 'night'">Sun down all day</p>
    <template v-else-if="figures.sunrise && figures.sunset">
      <svg
        class="desk-sunrise-arc"
        data-testid="daylight-arc"
        viewBox="0 0 100 32"
        role="img"
        :aria-label="`Sun ${Math.round(fraction * 100)}% of the way from sunrise to sunset`"
      >
        <path
          d="M6 28 A44 24 0 0 1 94 28"
          fill="none"
          stroke="currentColor"
          stroke-dasharray="2 3"
        />
        <line x1="2" y1="28" x2="98" y2="28" stroke="currentColor" />
        <circle data-testid="sun-dot" :cx="dot.x" :cy="dot.y" r="3.5" class="desk-sunrise-sun" />
      </svg>
      <p v-if="next" class="desk-sunrise-next">
        {{ next.label }} in <span class="desk-sunrise-num">{{ next.in }}</span>
      </p>
      <p class="desk-sunrise-times">
        <span
          >Sunrise <span class="desk-sunrise-num">{{ hhmm(figures.sunrise) }}</span></span
        >
        <span
          >Sunset <span class="desk-sunrise-num">{{ hhmm(figures.sunset) }}</span></span
        >
      </p>
    </template>
    <p>
      Day length <span class="desk-sunrise-num">{{ length }}</span>
    </p>
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
.desk-sunrise-arc {
  inline-size: 100%;
  max-inline-size: 12rem;
  block-size: auto;
  color: var(--color-fg-muted);
  stroke-width: 1;
}
.desk-sunrise-sun {
  fill: var(--color-warn);
}
.desk-sunrise-next {
  font-weight: 600;
}
.desk-sunrise-times {
  display: flex;
  gap: var(--space-4);
}
</style>
