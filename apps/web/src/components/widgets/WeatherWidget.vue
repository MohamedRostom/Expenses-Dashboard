<script setup lang="ts">
import { computed } from 'vue';
import type { TemperatureUnitT, WidgetT } from '@desk/contracts';

type Figures = NonNullable<Extract<WidgetT, { kind: 'weather' }>['figures']>;
const props = defineProps<{ figures: Figures; unit: TemperatureUnitT }>();

/** Celsius is what the server stores; Fahrenheit is derived here and rounded for display only. */
const show = (c: number) => Math.round(props.unit === 'F' ? (c * 9) / 5 + 32 : c);
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
const asOf = computed(() =>
  new Date(props.figures.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
);

// Names mirror WEATHER_ICONS in @desk/connectors/open-meteo/wmo (not a web dependency).
const ICONS: Record<string, string> = {
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v3M12 20v3M1 12h3M20 12h3',
  'partly-cloudy': 'M7 18a4 4 0 010-8 5 5 0 019.5 1A3.5 3.5 0 0116 18zM17 4v2M21 8h-2',
  cloud: 'M7 18a4 4 0 010-8 5 5 0 019.5 1A3.5 3.5 0 0116 18z',
  fog: 'M4 9h16M2 13h18M5 17h16',
  drizzle: 'M7 14a4 4 0 010-8 5 5 0 019.5 1A3.5 3.5 0 0116 14zM9 17v2M13 17v2',
  rain: 'M7 14a4 4 0 010-8 5 5 0 019.5 1A3.5 3.5 0 0116 14zM8 17l-1 4M12 17l-1 4M16 17l-1 4',
  snow: 'M12 2v20M3 7l18 10M21 7L3 17',
  thunder: 'M7 14a4 4 0 010-8 5 5 0 019.5 1A3.5 3.5 0 0116 14zM12 14l-2 4h4l-2 4',
};
const path = (icon: string) => ICONS[icon] ?? ICONS.cloud;
</script>

<template>
  <div class="desk-weather">
    <p class="desk-weather-place">{{ figures.place }}</p>
    <div class="desk-weather-now">
      <svg
        class="desk-weather-icon"
        :data-icon="figures.icon"
        viewBox="0 0 24 24"
        width="32"
        height="32"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        role="img"
        :aria-label="figures.condition"
      >
        <path :d="path(figures.icon)" />
      </svg>
      <strong class="desk-weather-temp">{{ show(figures.temperatureC) }}°{{ unit }}</strong>
    </div>
    <p class="desk-weather-condition">{{ figures.condition }}</p>
    <p class="desk-weather-range">
      H {{ show(figures.todayMaxC) }}° · L {{ show(figures.todayMinC) }}°
    </p>
    <ul class="desk-weather-outlook">
      <li v-for="d in figures.outlook" :key="d.date" data-testid="outlook-day">
        <span>{{ day(d.date) }}</span>
        <svg
          :data-icon="d.icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          role="img"
          :aria-label="d.condition"
        >
          <path :d="path(d.icon)" />
        </svg>
        <span class="desk-weather-num">{{ show(d.maxC) }}° / {{ show(d.minC) }}°</span>
      </li>
    </ul>
    <p class="desk-weather-meta">as of {{ asOf }} · {{ figures.attribution }}</p>
  </div>
</template>

<style scoped>
.desk-weather {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.desk-weather p {
  margin: 0;
}
.desk-weather-now {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.desk-weather-temp,
.desk-weather-range,
.desk-weather-num {
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-variant-numeric: tabular-nums;
}
.desk-weather-temp {
  font-size: 1.6rem;
}
.desk-weather-outlook {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.desk-weather-outlook li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.desk-weather-meta {
  font-size: 0.7rem;
  opacity: 0.7;
}
</style>
