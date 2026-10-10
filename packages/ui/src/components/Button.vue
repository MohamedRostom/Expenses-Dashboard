<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { variant: 'primary', size: 'md', disabled: false, loading: false, type: 'button' },
);
</script>

<template>
  <button
    :type="type"
    class="desk-btn"
    :class="[variant, { sm: size === 'sm' }]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="desk-btn-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.desk-btn {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  font-weight: 600;
  min-height: var(--target-min);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  transition: transform var(--motion-fast) var(--ease-standard);
}
.desk-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.desk-btn:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-btn.sm {
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-3);
}
.desk-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.desk-btn.primary {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.desk-btn.secondary {
  background: transparent;
  color: var(--color-fg);
  border-color: var(--color-fg);
}
.desk-btn.ghost {
  background: transparent;
  color: var(--color-fg);
  padding-inline: var(--space-3);
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
/* Desktop: pointer targets drop to 40px (DESIGN.md Layout; phone stays 44). */
@media (min-width: 1024px) {
  .desk-btn {
    min-height: var(--space-10);
  }
}
@media (prefers-reduced-motion: reduce) {
  .desk-btn {
    transition: none;
  }
  .desk-btn-spinner {
    animation-duration: 1.5s;
  }
}
</style>
