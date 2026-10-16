<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    modelValue?: string;
    options: { value: string; label: string }[];
    label?: string;
    error?: string;
    disabled?: boolean;
  }>(),
  { modelValue: '' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
const errorId = useId();
</script>

<template>
  <label class="desk-field">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <select
      class="desk-select"
      :class="{ invalid: !!error }"
      :aria-invalid="!!error"
      :aria-describedby="error ? errorId : undefined"
      :disabled="disabled"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <span v-if="error" :id="errorId" class="desk-field-error">{{ error }}</span>
  </label>
</template>

<style scoped>
.desk-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-field-label {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-select {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--target-min);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-fg);
}
.desk-select:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.desk-select.invalid {
  border-color: var(--color-critical);
}
.desk-field-error {
  font-size: var(--text-sm);
  color: var(--color-critical);
}
@media (min-width: 1024px) {
  .desk-select {
    min-height: var(--space-10);
  }
}
</style>
