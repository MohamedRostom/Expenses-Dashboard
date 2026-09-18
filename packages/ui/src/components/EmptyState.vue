<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="desk-empty-state">
    <div v-if="$slots.icon" class="desk-empty-icon"><slot name="icon" /></div>
    <p class="desk-empty-title">{{ title }}</p>
    <p v-if="description" class="desk-empty-desc">{{ description }}</p>
    <div v-if="$slots.action" class="desk-empty-action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.desk-empty-state {
  font-family: var(--font-sans);
  color: var(--color-fg);
  text-align: center;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.desk-empty-title {
  font-weight: 600;
  margin: 0;
}
.desk-empty-desc {
  margin: 0;
  opacity: 0.75;
  font-size: 0.9rem;
}
</style>
