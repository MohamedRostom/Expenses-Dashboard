<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

// ponytail: copy keyed by string here, not @desk/contracts's ErrorCode — keeps
// @desk/ui dependency-free. Callers pass ErrorCodeT values, which widen fine.
const COPY: Record<string, { title: string; description: string }> = {
  validation_failed: {
    title: "That didn't look right",
    description: 'Check the highlighted fields and try again.',
  },
  unauthenticated: {
    title: 'Sign in required',
    description: 'Your session may have expired.',
  },
  not_found: {
    title: 'Not found',
    description: "It may have been removed, or you don't have access.",
  },
  rate_limited: {
    title: 'Slow down',
    description: 'Too many requests — try again shortly.',
  },
  conflict: {
    title: 'Conflict',
    description: 'That change conflicts with something else. Refresh and retry.',
  },
  rate_unavailable: {
    title: 'Exchange rate unavailable',
    description: "We couldn't fetch a currency rate. Try again later.",
  },
};
const FALLBACK = { title: 'Something went wrong', description: 'Please try again.' };

const props = defineProps<{ code?: string; title?: string; description?: string }>();
const copy = computed(() => (props.code && COPY[props.code]) || FALLBACK);

// role="alert" only on the first render so a re-render with new props does not re-announce.
const announce = ref(true);
onMounted(() => {
  announce.value = false;
});
</script>

<template>
  <div class="desk-error-state" :role="announce ? 'alert' : undefined">
    <p class="desk-error-title">{{ title ?? copy.title }}</p>
    <p class="desk-error-desc">{{ description ?? copy.description }}</p>
    <div v-if="$slots.action" class="desk-error-action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.desk-error-state {
  font-family: var(--font-sans);
  color: var(--color-fg);
  text-align: center;
  padding: var(--space-8) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.desk-error-title {
  font-weight: 600;
  margin: 0;
  color: var(--color-critical);
}
.desk-error-desc {
  margin: 0;
  opacity: 0.85;
  font-size: 0.9rem;
}
</style>
