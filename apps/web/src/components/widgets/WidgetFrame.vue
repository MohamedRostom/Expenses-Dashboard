<script setup lang="ts">
/** The widget frame: a raised flap with header, drag grip, menu and banner (DESIGN.md Components,
 * compact widget variant). Moved out of @desk/ui's PanelFrame (T042): the copy and the Categories
 * link are widget-specific. Loading and error bodies are PanelFrame states. */
import { computed } from 'vue';
import { PanelFrame } from '@desk/ui';
import type { WidgetT } from '@desk/contracts';

const props = defineProps<{
  widget: Pick<WidgetT, 'id' | 'kind' | 'state' | 'cause' | 'asOf' | 'figures'>;
  index?: number;
  count?: number;
  atLimit?: boolean;
  offline?: boolean;
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

const w = computed(() => props.widget);
function onGripDown(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  emit('dragStart', e);
}

type Cause = NonNullable<WidgetT['cause']>;
const TITLES: Record<WidgetT['kind'], string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise and sunset',
  spend_pace: 'Spend pace',
  fixed_costs: 'Fixed costs',
};

const CAUSE_COPY: Record<Cause, string> = {
  rate_unavailable: 'No rate has been published for this date yet.',
  source_unreachable: "Couldn't reach the data source. Showing the last reading.",
  source_limit_reached: "The data source's daily limit is reached. Showing the last reading.",
  place_not_found: "This widget's place can't be found. Choose it again in settings.",
};

const frameTitle = computed(() => TITLES[w.value.kind]);
// asOf is server time; formatting it never consults the device clock.
const asOf = computed(() =>
  new Date(w.value.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
);
const hasFigures = computed(() => w.value.figures !== undefined);
const banner = computed(() => {
  const { state, cause } = w.value;
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
  const { state, kind } = w.value;
  if (state === 'empty' && (kind === 'spend_pace' || kind === 'fixed_costs')) return 'nothing';
  return state === 'error' ? 'error' : 'loading';
});
</script>

<template>
  <article
    class="desk-widget-frame"
    data-testid="widget-frame"
    :data-state="w.state"
    :data-widget-id="w.id"
    :aria-label="frameTitle"
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
      <h3 class="desk-widget-title" data-testid="widget-title">{{ frameTitle }}</h3>
      <span class="desk-widget-asof">as of {{ asOf }}</span>
      <details class="desk-widget-menu">
        <summary :aria-label="`${frameTitle} menu`">&#8943;</summary>
        <div class="desk-widget-menu-items">
          <button type="button" :disabled="index === 0" @click="$emit('move', -1)">Move up</button>
          <button type="button" :disabled="index === (count ?? 0) - 1" @click="$emit('move', 1)">
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
        {{ w.kind === 'spend_pace' ? 'No budget set.' : 'No fixed-cost categories yet.' }}
        <RouterLink to="/categories">{{
          w.kind === 'spend_pace'
            ? 'Set a budget in Categories'
            : 'Mark categories as fixed in Categories'
        }}</RouterLink>
      </p>
      <PanelFrame v-else-if="body === 'loading'" kind="loading" />
      <PanelFrame v-else kind="error" :code="w.cause ?? 'server_error'" />
    </div>
  </article>
</template>

<style scoped>
/* A raised flap with a fixed height: figures arriving never push the expenses below (FR-001). */
.desk-widget-frame {
  height: 12rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-raised);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-widget-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.desk-widget-grip {
  cursor: grab;
  touch-action: none;
  user-select: none;
  color: var(--color-fg-muted);
  letter-spacing: -0.2em;
}
.desk-widget-title {
  margin: 0;
  flex: 1;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-widget-asof {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-widget-menu {
  position: relative;
}
.desk-widget-menu summary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-min);
  min-inline-size: var(--target-min);
  cursor: pointer;
  list-style: none;
}
.desk-widget-menu-items {
  position: absolute;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-overlay);
  border-radius: var(--radius-md);
}
.desk-widget-menu-items button {
  background: none;
  border: none;
  color: var(--color-fg);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-align: left;
  white-space: nowrap;
  min-block-size: var(--target-min);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}
.desk-widget-menu-items button:disabled {
  color: var(--color-fg-muted);
  cursor: default;
}
/* Stale or failed with a last reading: amber, always in words. */
.desk-widget-banner {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  color: var(--color-warn);
}
.desk-widget-nothing {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-widget-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
