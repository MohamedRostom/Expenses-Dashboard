<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../../api/client.js';
import { useSessionStore } from '../../stores/session.js';
import type { Currency } from '../currencyFilter.js';

const CAP = 6;
const props = defineProps<{ chosen: string[] }>();
defineEmits<{ toggle: [code: string] }>();
const session = useSessionStore();

const currencies = ref<Currency[]>([]);
const error = ref('');
const defaultCode = computed(() => session.user?.defaultCurrency ?? '');
const atCap = computed(() => props.chosen.length >= CAP);

onMounted(async () => {
  try {
    currencies.value = (await apiFetch<{ currencies: Currency[] }>('/currencies')).currencies;
  } catch {
    error.value = "Couldn't load the currency list.";
  }
});

function disabledReason(code: string): string | null {
  const on = props.chosen.includes(code);
  if (code === defaultCode.value && !on) return 'your default currency';
  if (!on && atCap.value) return 'limit of six reached';
  return null;
}
</script>

<template>
  <fieldset class="desk-currency-settings">
    <legend>Currencies (up to six)</legend>
    <label v-for="c in currencies" :key="c.code" class="desk-currency-option">
      <input
        type="checkbox"
        :value="c.code"
        :checked="chosen.includes(c.code)"
        :disabled="disabledReason(c.code) !== null"
        @change="$emit('toggle', c.code)"
      />
      {{ c.code }} — {{ c.name }}
      <small v-if="disabledReason(c.code)">({{ disabledReason(c.code) }})</small>
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.desk-currency-settings {
  border: 0;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
}
.desk-currency-option {
  display: block;
  font-size: 0.9rem;
}
</style>
