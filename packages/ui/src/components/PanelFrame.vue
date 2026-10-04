<script setup lang="ts">
/** Titled panel. Without `widget` it is the loading/empty/error body (the old PanelState); with
 * `widget` it is the widget frame (the old WidgetFrame): header, drag grip, menu and banner. */
import { computed, useId } from 'vue';
import Skeleton from './Skeleton.vue';
import EmptyState from './EmptyState.vue';

type PanelErrorKind =
  | 'offline'
  | 'session_expired'
  | 'validation'
  | 'rate_unavailable'
  | 'connector_error'
  | 'source_unreachable'
  | 'source_limit_reached'
  | 'place_not_found'
  | 'source_paused'
  | 'rate_limited'
  | 'server_error';
/** Structural slice of @desk/contracts' WidgetT; @desk/ui does not depend on contracts. */
interface WidgetProp {
  id: string;
  kind: 'currency' | 'weather' | 'sunrise' | 'spend_pace' | 'fixed_costs';
  state: 'ready' | 'empty' | 'stale' | 'error' | 'unavailable';
  cause?:
    | 'rate_unavailable'
    | 'source_unreachable'
    | 'source_limit_reached'
    | 'place_not_found'
    | undefined;
  asOf: string;
  figures?: unknown;
}

const props = defineProps<{
  kind?: 'loading' | 'empty' | 'error' | undefined;
  code?: PanelErrorKind | undefined;
  title?: string | undefined;
  description?: string | undefined;
  /** Renders a labelled region header around the state; widget frames bring their own. */
  heading?: string;
  widget?: WidgetProp;
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
const headingId = useId();

// CLAUDE.md: "error copy branches on error code, never one generic banner."
const COPY: Record<PanelErrorKind, { title: string; description: string }> = {
  offline: {
    title: "You're offline",
    description:
      'Showing what was last loaded. New expenses can still be added and will sync later.',
  },
  session_expired: {
    title: 'Session expired',
    description: 'Sign in again to keep going.',
  },
  validation: {
    title: "That didn't look right",
    description: 'Check the highlighted fields and try again.',
  },
  rate_unavailable: {
    title: 'Exchange rate unavailable',
    description: "We couldn't fetch a currency rate. Try again later.",
  },
  connector_error: {
    title: 'Connector problem',
    description: 'The connected service had a problem. Check its settings or try again.',
  },
  source_unreachable: {
    title: "Couldn't reach the data source",
    description: 'Showing the last reading. Desk will try again shortly.',
  },
  source_limit_reached: {
    title: 'Data source limit reached',
    description: 'Desk has used its daily allowance for this source. It resets tomorrow.',
  },
  place_not_found: {
    title: 'Place not found',
    description: "Choose the place again in this widget's settings.",
  },
  source_paused: {
    title: 'Place search is paused',
    description: 'The data source has paused place search for now. Try again later.',
  },
  rate_limited: {
    title: 'Too many requests',
    description: 'Please wait a moment before trying again.',
  },
  server_error: {
    title: 'Something went wrong',
    description: 'Please try again shortly.',
  },
};

const errorCopy = computed(() => (props.code ? COPY[props.code] : COPY.server_error));

const w = computed(() => props.widget as WidgetProp);
function onGripDown(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  emit('dragStart', e);
}

const TITLES: Record<WidgetProp['kind'], string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise and sunset',
  spend_pace: 'Spend pace',
  fixed_costs: 'Fixed costs',
};

const CAUSE_COPY: Record<NonNullable<WidgetProp['cause']>, string> = {
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
  <template v-if="widget">
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
            <button type="button" :disabled="index === 0" @click="$emit('move', -1)">
              Move up
            </button>
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
  <section v-else-if="heading" class="desk-panel-frame" :aria-labelledby="headingId" role="region">
    <h3 :id="headingId" class="desk-panel-frame-heading">{{ heading }}</h3>
    <PanelFrame :kind="kind" :code="code" :title="title" :description="description">
      <template v-if="$slots.action" #action><slot name="action" /></template>
    </PanelFrame>
  </section>
  <Skeleton v-else-if="kind === 'loading'" height="8rem" />
  <EmptyState
    v-else-if="kind === 'empty'"
    :title="title ?? 'Nothing here yet'"
    :description="description ?? ''"
  />
  <div v-else class="desk-panel-error" role="alert">
    <p class="desk-panel-error-title">{{ title ?? errorCopy.title }}</p>
    <p class="desk-panel-error-desc">{{ description ?? errorCopy.description }}</p>
    <div v-if="$slots.action" class="desk-panel-error-action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.desk-panel-error {
  font-family: var(--font-sans);
  color: var(--color-fg);
  text-align: center;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.desk-panel-error-title {
  font-weight: 600;
  margin: 0;
  color: var(--color-critical);
}
.desk-panel-error-desc {
  margin: 0;
  opacity: 0.85;
  font-size: 0.9rem;
}
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
.desk-panel-frame-heading {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
}
</style>
