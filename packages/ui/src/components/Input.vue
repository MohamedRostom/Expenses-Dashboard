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
    /** Leading text inside the field (for example a currency code), drawn as generated content so the label text stays exact. */
    adornment?: string;
  }>(),
  { modelValue: '', type: 'text', variant: 'text' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
const errorId = useId();
</script>

<template>
  <label class="desk-field">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <span class="desk-input-wrap" :data-adornment="adornment">
      <input
        class="desk-input"
        :class="{ invalid: !!error, amount: variant === 'amount', adorned: !!adornment }"
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
    </span>
    <span v-if="error" :id="errorId" class="desk-field-error">{{ error }}</span>
    <slot name="error" />
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
.desk-input-wrap {
  position: relative;
  display: flex;
}
.desk-input {
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
.desk-input:focus-visible,
/* Chromium keeps a date field's focus on an inner segment, so :focus-visible never matches the input. */
.desk-input[type='date']:focus-within {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
/* Figures: the figure face, right-aligned; dates read as figures too. */
.desk-input.amount,
.desk-input[type='date'] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-input.amount {
  text-align: right;
}
.desk-input-wrap[data-adornment]::before {
  content: attr(data-adornment);
  position: absolute;
  inset-block: 0;
  inset-inline-start: var(--space-3);
  display: flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
  pointer-events: none;
}
.desk-input.adorned {
  padding-inline-start: var(--space-12);
}
.desk-input.invalid {
  border-color: var(--color-critical);
}
.desk-field-error {
  font-size: var(--text-sm);
  color: var(--color-critical);
}
/* Desktop: targets drop to 40px (DESIGN.md Layout; phone stays 44). */
@media (min-width: 1024px) {
  .desk-input {
    min-height: var(--space-10);
  }
}
</style>
