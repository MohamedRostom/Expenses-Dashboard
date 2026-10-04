<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetT, WidgetCauseT } from '@desk/contracts';
import PanelState from '../PanelState.vue';

const props = defineProps<{
  widget: WidgetT;
  index: number;
  count: number;
  atLimit: boolean;
  offline: boolean;
}>();
const emit = defineEmits<{
  settings: [];
  remove: [];
  move: [dir: -1 | 1];
  duplicate: [];
  dragStart: [e: PointerEvent];
  dragMove: [e: PointerEvent];
  dragEnd: [e: PointerEvent];
}>();

function onGripDown(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  emit('dragStart', e);
}

const TITLES: Record<WidgetT['kind'], string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise and sunset',
  spend_pace: 'Spend pace',
  fixed_costs: 'Fixed costs',
};

const CAUSE_COPY: Record<WidgetCauseT, string> = {
  rate_unavailable: 'No rate has been published for this date yet.',
  source_unreachable: "Couldn't reach the data source. Showing the last reading.",
  source_limit_reached: "The data source's daily limit is reached. Showing the last reading.",
  place_not_found: "This widget's place can't be found. Choose it again in settings.",
};

const title = computed(() => TITLES[props.widget.kind]);
// asOf is server time; formatting it never consults the device clock.
const asOf = computed(() =>
  new Date(props.widget.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
);
const hasFigures = computed(() => props.widget.figures !== undefined);
const banner = computed(() => {
  const { state, cause } = props.widget;
  if (props.offline && hasFigures.value) return "You're offline — showing the last reading";
  if (state === 'unavailable') return 'This widget is unavailable right now.';
  if (state === 'stale') return (cause && CAUSE_COPY[cause]) || 'Showing the last reading.';
  if (state === 'error' && hasFigures.value) {
    return (cause && CAUSE_COPY[cause]) || 'Something went wrong. Showing the last reading.';
  }
  return null;
});
// state 'empty' with no figures is a reading that has not arrived yet: show the skeleton.
// Spend pace and fixed costs have no external source: 'empty' there means nothing to show, not pending.
const body = computed<'figures' | 'loading' | 'error' | 'nothing'>(() => {
  if (hasFigures.value) return 'figures';
  const { state, kind } = props.widget;
  if (state === 'empty' && (kind === 'spend_pace' || kind === 'fixed_costs')) return 'nothing';
  return state === 'error' ? 'error' : 'loading';
});
</script>

<template>
  <article
    class="desk-widget-frame"
    data-testid="widget-frame"
    :data-state="widget.state"
    :data-widget-id="widget.id"
    :aria-label="title"
  >
    <header class="desk-widget-head">
      <span
        class="desk-widget-grip"
        data-testid="widget-grip"
        aria-hidden="true"
        @pointerdown="onGripDown"
        @pointermove="$emit('dragMove', $event)"
        @pointerup="$emit('dragEnd', $event)"
        @pointercancel="$emit('dragEnd', $event)"
        >&#8942;&#8942;</span
      >
      <h3 class="desk-widget-title" data-testid="widget-title">{{ title }}</h3>
      <span class="desk-widget-asof">as of {{ asOf }}</span>
      <details class="desk-widget-menu">
        <summary :aria-label="`${title} menu`">&#8943;</summary>
        <div class="desk-widget-menu-items">
          <button type="button" :disabled="index === 0" @click="$emit('move', -1)">Move up</button>
          <button type="button" :disabled="index === count - 1" @click="$emit('move', 1)">
            Move down
          </button>
          <button type="button" :disabled="atLimit" @click="$emit('duplicate')">Duplicate</button>
          <button type="button" @click="$emit('settings')">Settings</button>
          <button type="button" @click="$emit('remove')">Remove</button>
        </div>
      </details>
    </header>
    <p v-if="banner" class="desk-widget-banner" role="status">{{ banner }}</p>
    <div class="desk-widget-body">
      <slot v-if="body === 'figures'" />
      <p v-else-if="body === 'nothing'" class="desk-widget-nothing">
        {{ widget.kind === 'spend_pace' ? 'No budget set.' : 'No fixed-cost categories yet.' }}
        <RouterLink to="/categories">{{
          widget.kind === 'spend_pace'
            ? 'Set a budget in Categories'
            : 'Mark categories as fixed in Categories'
        }}</RouterLink>
      </p>
      <PanelState v-else-if="body === 'loading'" kind="loading" />
      <PanelState v-else kind="error" :code="widget.cause ?? 'server_error'" />
    </div>
  </article>
</template>

<style scoped>
.desk-widget-frame {
  /* Fixed height: figures arriving never push the expenses below (FR-001). */
  height: 12rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-widget-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.desk-widget-grip {
  cursor: grab;
  touch-action: none;
  user-select: none;
  opacity: 0.5;
  letter-spacing: -0.2em;
}
.desk-widget-menu-items button:disabled {
  opacity: 0.4;
  cursor: default;
}
.desk-widget-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  flex: 1;
}
.desk-widget-asof {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.7rem;
  opacity: 0.7;
}
.desk-widget-menu {
  position: relative;
}
.desk-widget-menu summary {
  cursor: pointer;
  list-style: none;
  padding: 0 0.3rem;
}
.desk-widget-menu-items {
  position: absolute;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border: 1px solid color-mix(in srgb, var(--color-fg) 20%, transparent);
  border-radius: 6px;
}
.desk-widget-menu-items button {
  background: none;
  border: none;
  color: var(--color-fg);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}
.desk-widget-banner {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-warn);
}
.desk-widget-nothing {
  margin: 0;
  font-size: 0.85rem;
}
.desk-widget-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
