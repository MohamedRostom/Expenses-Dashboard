<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiFetch } from '../api/client.js';
import { filterCurrencies, type Currency } from './currencyFilter.js';

const props = withDefaults(defineProps<{ modelValue?: string; label?: string }>(), {
  modelValue: '',
  label: 'Currency',
});
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const currencies = ref<Currency[]>([]);
const query = ref(props.modelValue);
const open = ref(false);

onMounted(async () => {
  try {
    const res = await apiFetch<{ currencies: Currency[] }>('/currencies');
    currencies.value = res.currencies;
  } catch {
    // ponytail: silent — picker degrades to free-text entry if /currencies is down
  }
});

function select(code: string) {
  query.value = code;
  emit('update:modelValue', code);
  open.value = false;
}
</script>

<template>
  <label class="desk-field currency-picker">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <input
      class="desk-input"
      type="text"
      autocomplete="off"
      :value="query"
      @input="
        query = ($event.target as HTMLInputElement).value;
        open = true;
      "
      @focus="open = true"
      @blur="open = false"
    />
    <ul v-if="open && query" class="currency-picker-list">
      <li
        v-for="c in filterCurrencies(currencies, query)"
        :key="c.code"
        class="currency-picker-item"
        @mousedown.prevent="select(c.code)"
      >
        {{ c.code }} — {{ c.name }}
      </li>
    </ul>
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
.currency-picker {
  position: relative;
}
.currency-picker-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  margin: 0.25rem 0 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-fg);
  border-radius: 6px;
  max-height: 12rem;
  overflow-y: auto;
}
.currency-picker-item {
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.currency-picker-item:hover {
  background: var(--color-accent);
  color: var(--color-bg);
}
</style>
