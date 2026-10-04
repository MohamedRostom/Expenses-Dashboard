<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@desk/ui';
import type { WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';
import CurrencyPicker from './CurrencyPicker.vue';
import WeatherSettings from './WeatherSettings.vue';
import SunriseSettings from './SunriseSettings.vue';

const CAP = 6;
const props = defineProps<{ open: boolean; widget: WidgetT | null }>();
defineEmits<{ close: [] }>();
const store = useWidgetsStore();

/** Changes apply immediately: the kind's settings component calls `patch` on each change. */
function patch(body: WidgetPatchT) {
  return store.patch(props.widget!.id, body);
}

const error = ref('');
const isCurrency = computed(() => props.widget?.kind === 'currency');
const chosen = computed(() => (props.widget?.settings.currencies as string[] | undefined) ?? []);
const atCap = computed(() => chosen.value.length >= CAP);

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
      <div v-if="isCurrency">
        <CurrencyPicker :chosen="chosen" @toggle="toggle" />
        <p v-if="atCap">
          A currency widget shows up to six currencies.
          <button type="button" @click="addSecond">Add a second currency widget</button>
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
      <WeatherSettings v-else-if="widget.kind === 'weather'" :widget="widget" :patch="patch" />
      <SunriseSettings v-else-if="widget.kind === 'sunrise'" :widget="widget" :patch="patch" />
      <p v-else>This widget has no options.</p>
    </slot>
  </Dialog>
</template>
