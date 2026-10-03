<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Button, EmptyState, useToast } from '@desk/ui';
import type { WidgetKindT, WidgetTypeT } from '@desk/contracts';
import { ApiError } from '../../api/client.js';
import { useWidgetsStore } from '../../stores/widgets.js';
import CurrencyWidget from './CurrencyWidget.vue';
import WeatherWidget from './WeatherWidget.vue';
import SunriseWidget from './SunriseWidget.vue';
import SpendPaceWidget from './SpendPaceWidget.vue';
import FixedCostsWidget from './FixedCostsWidget.vue';
import WidgetFrame from './WidgetFrame.vue';
import AddWidgetSheet from './AddWidgetSheet.vue';
import WidgetSettingsSheet from './WidgetSettingsSheet.vue';

const store = useWidgetsStore();
const toast = useToast();
const catalogue = ref<WidgetTypeT[]>([]);
const adding = ref(false);
const settingsId = ref<string | null>(null);
const loaded = ref(false);

const atLimit = computed(() => store.widgets.length >= store.limit);
const enabledTypes = computed(() => catalogue.value.filter((t) => t.enabled));
const settingsWidget = computed(() => store.widgets.find((w) => w.id === settingsId.value) ?? null);

onMounted(async () => {
  try {
    await store.load();
  } catch {
    // store.error carries the kind of failure; a failed strip stays quiet, the month view is intact.
  }
  loaded.value = true;
  store.start();
  try {
    catalogue.value = await store.types();
  } catch {
    catalogue.value = [];
  }
});
onUnmounted(() => store.stop());

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

async function onAdd(kind: WidgetKindT) {
  try {
    await store.add({ kind });
    adding.value = false;
  } catch (err) {
    toast.push(message(err, 'Failed to add widget.'), 'critical');
  }
}

async function onRemove(id: string, name: string) {
  if (!confirm(`Remove the ${name} widget?`)) return;
  try {
    await store.remove(id);
  } catch (err) {
    toast.push(message(err, 'Failed to remove widget.'), 'critical');
  }
}
</script>

<template>
  <section class="desk-widget-strip" aria-label="Widgets" data-testid="widget-strip">
    <div class="desk-widget-strip-head">
      <Button
        data-testid="add-widget"
        variant="secondary"
        :disabled="atLimit"
        @click="adding = true"
      >
        Add widget ({{ store.widgets.length }} of {{ store.limit }})
      </Button>
    </div>

    <EmptyState
      v-if="loaded && store.widgets.length === 0"
      title="No widgets yet"
      description="Widgets show small, read-only figures such as exchange rates or your spend pace, right above your expenses."
    >
      <template v-if="enabledTypes.length > 0" #action>
        <p class="desk-widget-offer">Available: {{ enabledTypes.map((t) => t.name).join(', ') }}</p>
      </template>
    </EmptyState>

    <div v-else class="desk-widget-grid">
      <WidgetFrame
        v-for="w in store.widgets"
        :key="w.id"
        :widget="w"
        @settings="settingsId = w.id"
        @remove="onRemove(w.id, w.kind.replace('_', ' '))"
      >
        <!-- WidgetFrame shows the skeleton/error when figures are absent. -->
        <CurrencyWidget v-if="w.kind === 'currency' && w.figures" :rows="w.figures.rows" />
        <WeatherWidget
          v-else-if="w.kind === 'weather' && w.figures"
          :figures="w.figures"
          :unit="store.temperatureUnit"
        />
        <SunriseWidget v-else-if="w.kind === 'sunrise' && w.figures" :figures="w.figures" />
        <SpendPaceWidget v-else-if="w.kind === 'spend_pace' && w.figures" :figures="w.figures" />
        <FixedCostsWidget v-else-if="w.kind === 'fixed_costs' && w.figures" :figures="w.figures" />
      </WidgetFrame>
    </div>

    <p class="desk-widget-attribution"><slot name="attribution" /></p>

    <AddWidgetSheet :open="adding" :types="catalogue" @close="adding = false" @add="onAdd" />
    <WidgetSettingsSheet
      :open="settingsId !== null"
      :widget="settingsWidget"
      @close="settingsId = null"
    />
  </section>
</template>

<style scoped>
.desk-widget-strip {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.desk-widget-strip-head {
  display: flex;
  justify-content: flex-end;
}
.desk-widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 0.75rem;
}
.desk-widget-offer,
.desk-widget-placeholder {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.8;
}
.desk-widget-attribution {
  margin: 0;
  font-size: 0.7rem;
  opacity: 0.7;
}
.desk-widget-attribution:empty {
  display: none;
}
</style>
