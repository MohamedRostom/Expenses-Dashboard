<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Dialog } from '@desk/ui';
import type { WidgetPatchT, WidgetT } from '@desk/contracts';
import { apiFetch } from '../../api/client.js';
import { useSessionStore } from '../../stores/session.js';
import { useWidgetsStore } from '../../stores/widgets.js';
import type { Currency } from '../currencyFilter.js';

const CAP = 6;
const props = defineProps<{ open: boolean; widget: WidgetT | null }>();
defineEmits<{ close: [] }>();
const store = useWidgetsStore();
const session = useSessionStore();

/** Changes apply immediately: the kind's settings component calls `patch` on each change. */
function patch(body: WidgetPatchT) {
  return store.patch(props.widget!.id, body);
}

const currencies = ref<Currency[]>([]);
const error = ref('');
const isCurrency = computed(() => props.widget?.kind === 'currency');
const chosen = computed(() => (props.widget?.settings.currencies as string[] | undefined) ?? []);
const defaultCode = computed(() => session.user?.defaultCurrency ?? '');
const atCap = computed(() => chosen.value.length >= CAP);

watch(
  isCurrency,
  async (yes) => {
    if (!yes || currencies.value.length > 0) return;
    try {
      currencies.value = (await apiFetch<{ currencies: Currency[] }>('/currencies')).currencies;
    } catch {
      error.value = "Couldn't load the currency list.";
    }
  },
  { immediate: true },
);

function disabledReason(code: string): string | null {
  const on = chosen.value.includes(code);
  if (code === defaultCode.value && !on) return 'your default currency';
  if (!on && atCap.value) return `limit of six reached`;
  return null;
}

async function toggle(code: string) {
  const next = chosen.value.includes(code)
    ? chosen.value.filter((c) => c !== code)
    : [...chosen.value, code];
  if (next.length === 0) return;
  error.value = '';
  try {
    await patch({ settings: { currencies: next } });
  } catch {
    error.value = "Couldn't save that change.";
  }
}

async function addSecond() {
  try {
    await store.add({ kind: 'currency' });
  } catch {
    error.value = "Couldn't add another currency widget.";
  }
}
</script>

<template>
  <Dialog :open="open && widget !== null" title="Widget settings" @close="$emit('close')">
    <!-- Per-kind settings components (US2) fill this slot; only this widget's options. -->
    <slot v-if="widget" :widget="widget" :patch="patch">
      <fieldset v-if="isCurrency" class="desk-currency-settings">
        <legend>Currencies (up to six)</legend>
        <label v-for="c in currencies" :key="c.code" class="desk-currency-option">
          <input
            type="checkbox"
            :value="c.code"
            :checked="chosen.includes(c.code)"
            :disabled="disabledReason(c.code) !== null"
            @change="toggle(c.code)"
          />
          {{ c.code }} — {{ c.name }}
          <small v-if="disabledReason(c.code)">({{ disabledReason(c.code) }})</small>
        </label>
        <p v-if="atCap">
          A currency widget shows up to six currencies.
          <button type="button" @click="addSecond">Add a second currency widget</button>
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
      </fieldset>
      <p v-else>This widget has no options.</p>
    </slot>
  </Dialog>
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
