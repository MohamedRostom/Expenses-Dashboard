<script setup lang="ts">
withDefaults(defineProps<{ height?: string; width?: string }>(), {
  height: '1rem',
  width: '100%',
});
</script>

<template>
  <div class="desk-skeleton" :style="{ height, width }" aria-hidden="true" />
</template>

<style scoped>
/* A blank flap (Board Ink at 6%) that pulses in opacity; the duration is a token, so reduced motion
 * (0ms) holds it still. */
.desk-skeleton {
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
  animation: desk-pulse calc(var(--motion-slow) * 5) var(--ease-standard) infinite alternate;
}
@keyframes desk-pulse {
  to {
    opacity: 0.5;
  }
}
@media (prefers-reduced-motion: reduce) {
  .desk-skeleton {
    animation: none;
  }
}
</style>
