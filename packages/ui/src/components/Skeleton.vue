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
.desk-skeleton {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-fg) 8%, transparent) 25%,
    color-mix(in srgb, var(--color-fg) 16%, transparent) 37%,
    color-mix(in srgb, var(--color-fg) 8%, transparent) 63%
  );
  background-size: 400% 100%;
  animation: desk-shimmer 1.4s ease infinite;
}
@keyframes desk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
