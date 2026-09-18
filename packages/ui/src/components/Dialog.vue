<script setup lang="ts">
// ponytail: no focus trap, keep simple — add if a11y audit flags it.
defineProps<{ open: boolean; title?: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="desk-dialog-backdrop" @click.self="$emit('close')">
      <div class="desk-dialog" role="dialog" aria-modal="true">
        <header v-if="title" class="desk-dialog-header">{{ title }}</header>
        <div class="desk-dialog-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.desk-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 40%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.desk-dialog {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
  border-radius: 8px;
  padding: 1rem;
  min-width: 280px;
  max-width: 90vw;
}
.desk-dialog-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
}
</style>
