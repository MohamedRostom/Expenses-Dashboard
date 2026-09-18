<script setup lang="ts">
import { useToast } from '../composables/useToast.js';

const { toasts, dismiss } = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="desk-toast-stack">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="desk-toast"
        :class="t.variant"
        @click="dismiss(t.id)"
      >
        {{ t.text }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.desk-toast-stack {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 200;
}
.desk-toast {
  font-family: var(--font-sans);
  background: var(--color-fg);
  color: var(--color-bg);
  padding: 0.6rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
}
.desk-toast.warn {
  background: var(--color-warn);
}
.desk-toast.critical {
  background: var(--color-critical);
}
</style>
