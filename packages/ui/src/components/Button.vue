<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { variant: 'primary', disabled: false, loading: false, type: 'button' },
);
</script>

<template>
  <button :type="type" class="desk-btn" :class="variant" :disabled="disabled || loading">
    <span v-if="loading" class="desk-btn-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.desk-btn {
  font-family: var(--font-sans);
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.desk-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.desk-btn.primary {
  background: var(--color-accent);
  color: var(--color-bg);
}
.desk-btn.secondary {
  background: transparent;
  color: var(--color-fg);
  border-color: var(--color-fg);
}
.desk-btn.danger {
  background: var(--color-critical);
  color: var(--color-bg);
}
.desk-btn-spinner {
  width: 0.8em;
  height: 0.8em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: desk-spin 0.6s linear infinite;
}
@keyframes desk-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
