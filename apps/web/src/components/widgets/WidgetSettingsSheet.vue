<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@desk/ui';
import { CURRENCY_CAP } from '@desk/core';
import type { WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';
import CurrencyPicker from './CurrencyPicker.vue';
import WeatherSettings from './WeatherSettings.vue';
import SunriseSettings from './SunriseSettings.vue';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';
import PanelState from '../PanelState.vue';

const props = defineProps<{ open: boolean; widget: WidgetT | null }>();
defineEmits<{ close: [] }>();
const store = useWidgetsStore();

/** Changes apply immediately: the kind's settings component calls `patch` on each change. */
function patch(body: WidgetPatchT) {
  return store.patch(props.widget!.id, body);
}

const error = ref<PanelErrorKind | null>(null);
const chosen = computed(() => (props.widget?.settings.currencies as string[] | undefined) ?? []);
const atCap = computed(() => chosen.value.length >= CURRENCY_CAP);

async function toggle(code: string) {
  const next = chosen.value.includes(code)
    ? chosen.value.filter((c) => c !== code)
    : [...chosen.value, code];
  if (next.length === 0) return;
  error.value = null;
  try {
    await patch({ settings: { currencies: next } });
  } catch (err) {
    error.value = toPanelErrorKind(err);
  }
}

async function addSecond() {
  error.value = null;
  try {
    await store.add({ kind: 'currency' });
  } catch (err) {
    error.value = toPanelErrorKind(err);
  }
}
</script>

<template>
  <Dialog :open="open && widget !== null" title="Widget settings" @close="$emit('close')">
    <template v-if="widget">
      <div v-if="widget.kind === 'currency'">
        <CurrencyPicker :chosen="chosen" @toggle="toggle" />
        <p v-if="atCap">
          A currency widget shows up to six currencies.
          <button type="button" @click="addSecond">Add a second currency widget</button>
        </p>
        <PanelState v-if="error" kind="error" :code="error" />
      </div>
      <WeatherSettings v-else-if="widget.kind === 'weather'" :widget="widget" :patch="patch" />
      <SunriseSettings v-else-if="widget.kind === 'sunrise'" :widget="widget" :patch="patch" />
      <p v-else>This widget has no options.</p>
    </template>
  </Dialog>
</template>
