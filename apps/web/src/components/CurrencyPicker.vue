<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const activeIndex = ref(-1);
const listboxId = `currency-picker-list-${Math.random().toString(36).slice(2)}`;

const matches = computed(() => filterCurrencies(currencies.value, query.value));

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
  activeIndex.value = -1;
}

/** Typing a valid code and tabbing away (no mouse click) previously left modelValue at its old
 * value — the input looked updated but nothing was actually saved. */
function onBlur() {
  const typed = query.value.trim().toUpperCase();
  if (typed && currencies.value.some((c) => c.code === typed)) {
    query.value = typed;
    emit('update:modelValue', typed);
  }
  open.value = false;
  activeIndex.value = -1;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    open.value = true;
    activeIndex.value = Math.min(activeIndex.value + 1, matches.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    const active = matches.value[activeIndex.value];
    if (open.value && active) {
      e.preventDefault();
      select(active.code);
    }
  } else if (e.key === 'Escape') {
    open.value = false;
    activeIndex.value = -1;
  }
}
</script>

<template>
  <label class="desk-field currency-picker">
    <span v-if="label" class="desk-field-label">{{ label }}</span>
    <input
      class="desk-input"
      type="text"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open && matches.length > 0"
      :aria-controls="listboxId"
      :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined"
      :value="query"
      @input="
        query = ($event.target as HTMLInputElement).value;
        open = true;
        activeIndex = -1;
      "
      @focus="open = true"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul v-if="open && query" :id="listboxId" class="currency-picker-list" role="listbox">
      <li
        v-for="(c, i) in matches"
        :id="`${listboxId}-${i}`"
        :key="c.code"
        class="currency-picker-item"
        role="option"
        :aria-selected="i === activeIndex"
        :class="{ 'currency-picker-item-active': i === activeIndex }"
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
.currency-picker-item:hover,
.currency-picker-item-active {
  background: var(--color-accent);
  color: var(--color-bg);
}
</style>
