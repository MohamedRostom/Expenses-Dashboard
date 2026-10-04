<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    type?: string;
    error?: string;
    placeholder?: string;
    disabled?: boolean;
    variant?: 'text' | 'amount' | 'search';
  }>(),
  { modelValue: '', type: 'text', variant: 'text' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
const errorId = useId();
</script>

<template>
  <label class="desk-field">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <input
      class="desk-input"
      :class="{ invalid: !!error, amount: variant === 'amount' }"
      :type="variant === 'search' ? 'search' : type"
      :step="type === 'number' ? 'any' : undefined"
      :inputmode="type === 'number' || variant === 'amount' ? 'decimal' : undefined"
      :aria-invalid="!!error"
      :aria-describedby="error ? errorId : undefined"
      :disabled="disabled"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" :id="errorId" class="desk-field-error">{{ error }}</span>
    <slot name="error" />
  </label>
</template>

<style scoped>
.desk-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-field-label {
  font-size: 0.85rem;
}
.desk-input {
  font-family: var(--font-sans);
  padding: var(--space-2);
  border-radius: 6px;
  border: 1px solid var(--color-fg);
  background: var(--color-bg);
  color: var(--color-fg);
}
.desk-input:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.desk-input.amount {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-input.invalid {
  border-color: var(--color-critical);
}
.desk-field-error {
  font-size: 0.8rem;
  color: var(--color-critical);
}
</style>
