<script setup lang="ts">
/** Titled panel: the loading/empty/error body (the old PanelState), optionally under a heading.
 * The widget frame lives in apps/web (components/widgets/WidgetFrame.vue). */
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
const props = defineProps<{
  kind?: 'loading' | 'empty' | 'error' | undefined;
  code?: PanelErrorKind | undefined;
  title?: string | undefined;
  description?: string | undefined;
  /** Renders a labelled region header around the state; widget frames bring their own. */
  heading?: string;
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
</script>

<template>
  <section v-if="heading" class="desk-panel-frame" :aria-labelledby="headingId" role="region">
    <h3 :id="headingId" class="desk-panel-frame-heading">{{ heading }}</h3>
    <!-- Loaded content: a state (kind) always wins over the slot, so error and empty stay as they were. -->
    <div v-if="!kind" class="desk-panel-frame-flap surface"><slot /></div>
    <PanelFrame v-else :kind="kind" :code="code" :title="title" :description="description">
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
  padding: var(--space-8) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.desk-panel-error-title {
  font-weight: 600;
  margin: 0;
  color: var(--color-critical);
}
.desk-panel-error-desc {
  margin: 0;
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-panel-frame {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
/* Title role heading over a raised flap; the flap has no side padding so a board can run edge to edge. */
.desk-panel-frame-heading {
  margin: 0;
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
}
.desk-panel-frame-flap {
  padding: var(--space-2) 0;
  overflow: hidden;
}
</style>
