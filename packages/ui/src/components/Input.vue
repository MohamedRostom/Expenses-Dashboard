<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    type?: string;
    error?: string;
    placeholder?: string;
  }>(),
  { modelValue: '', type: 'text' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <label class="desk-field">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <input
      class="desk-input"
      :class="{ invalid: !!error }"
      :type="type"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="desk-field-error">{{ error }}</span>
    <slot name="error" />
  </label>
</template>

<style scoped>
.desk-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-field-label {
  font-size: 0.85rem;
}
.desk-input {
  font-family: var(--font-sans);
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-fg);
  background: var(--color-bg);
  color: var(--color-fg);
}
.desk-input.invalid {
  border-color: var(--color-critical);
}
.desk-field-error {
  font-size: 0.8rem;
  color: var(--color-critical);
}
</style>
