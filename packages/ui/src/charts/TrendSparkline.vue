<script setup lang="ts">
/**
 * Minimal month-over-month spend trend line. Hand-written SVG, single hue, no chart library —
 * matches CategoryBars.vue's style. `points` is oldest-first, minor units.
 */
export interface TrendPoint {
  month: string;
  spent: number;
}

const props = defineProps<{
  points: TrendPoint[];
}>();

const VIEW_W = 100;
const VIEW_H = 24;

function pathD(): string {
  if (props.points.length === 0) return '';
  const max = Math.max(1, ...props.points.map((p) => p.spent));
  const step = props.points.length > 1 ? VIEW_W / (props.points.length - 1) : 0;
  return props.points
    .map((p, i) => {
      const x = props.points.length > 1 ? i * step : VIEW_W / 2;
      const y = VIEW_H - (p.spent / max) * VIEW_H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

defineExpose({ pathD });
</script>

<template>
  <svg
    class="desk-trend-sparkline"
    :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
    preserveAspectRatio="none"
    role="img"
    aria-label="Spend trend over recent months"
  >
    <path :d="pathD()" class="desk-trend-sparkline-line" fill="none" />
  </svg>
</template>

<style scoped>
.desk-trend-sparkline {
  width: 100%;
  height: 1.5rem;
}
.desk-trend-sparkline-line {
  stroke: var(--color-accent);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
</style>
