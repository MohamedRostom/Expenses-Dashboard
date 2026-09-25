<script setup lang="ts">
import { computed } from 'vue';
import { Skeleton, EmptyState } from '@desk/ui';
import type { PanelErrorKind } from '../utils/errors.js';

const props = defineProps<{
  kind: 'loading' | 'empty' | 'error';
  code?: PanelErrorKind;
  title?: string;
  description?: string;
}>();

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
  server_error: {
    title: 'Something went wrong',
    description: 'Please try again shortly.',
  },
};

const errorCopy = computed(() => (props.code ? COPY[props.code] : COPY.server_error));
</script>

<template>
  <Skeleton v-if="kind === 'loading'" height="8rem" />
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
</style>
