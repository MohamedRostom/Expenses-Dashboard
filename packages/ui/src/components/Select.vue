<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string;
    options: { value: string; label: string }[];
    label?: string;
  }>(),
  { modelValue: '' },
);
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <label class="desk-field">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <select
      class="desk-select"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
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
.desk-select {
  font-family: var(--font-sans);
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-fg);
  background: var(--color-bg);
  color: var(--color-fg);
}
</style>
