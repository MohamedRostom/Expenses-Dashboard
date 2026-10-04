<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Button, EmptyState, useToast } from '@desk/ui';
import type { WidgetCreateT, WidgetTypeT } from '@desk/contracts';
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

const dragOrder = ref<string[] | null>(null);
const announcement = ref('');
const online = ref(0); // bumped on online/offline events: navigator.onLine is not reactive
const bump = () => online.value++;
const offline = computed(() => (online.value, store.isOffline()));
const shown = computed(() => {
  const order = dragOrder.value;
  if (!order) return store.widgets;
  return order.flatMap((id) => store.widgets.find((w) => w.id === id) ?? []);
});

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
  window.addEventListener('online', bump);
  window.addEventListener('offline', bump);
  store.start();
  try {
    catalogue.value = await store.types();
  } catch {
    catalogue.value = [];
  }
});
onUnmounted(() => {
  window.removeEventListener('online', bump);
  window.removeEventListener('offline', bump);
  store.stop();
});

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

async function onAdd(body: WidgetCreateT) {
  await store.add(body); // rejections surface inside the sheet
  adding.value = false;
}

async function onRemove(id: string, name: string) {
  if (!confirm(`Remove the ${name} widget?`)) return;
  try {
    await store.remove(id);
  } catch (err) {
    toast.push(message(err, 'Failed to remove widget.'), 'critical');
  }
}

const label = (kind: string) => {
  const s = kind.replace('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

async function save(ids: string[]) {
  try {
    await store.reorder(ids);
    return true;
  } catch (err) {
    toast.push(message(err, 'Failed to save the new order.'), 'critical');
    return false;
  }
}

async function onMove(id: string, dir: -1 | 1) {
  const ids = store.widgets.map((w) => w.id);
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]!);
  const w = store.widgets[from]!;
  if (await save(ids))
    announcement.value = `${label(w.kind)} moved to position ${to + 1} of ${ids.length}`;
}

async function onDuplicate(id: string) {
  try {
    await store.duplicate(id);
  } catch (err) {
    toast.push(message(err, 'Failed to duplicate widget.'), 'critical');
  }
}

// Pointer drag, no library: the grip captures the pointer; frames are hit-tested by rect.
const dragging = ref<string | null>(null);
const grid = ref<HTMLElement | null>(null);

function onDragStart(id: string) {
  dragging.value = id;
  dragOrder.value = store.widgets.map((w) => w.id);
}

function onDragMove(e: PointerEvent) {
  const order = dragOrder.value;
  if (!dragging.value || !order) return;
  const frames = [...(grid.value?.querySelectorAll<HTMLElement>('[data-widget-id]') ?? [])];
  const over = frames.find((f) => {
    const r = f.getBoundingClientRect();
    return (
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    );
  })?.dataset.widgetId;
  if (!over || over === dragging.value) return;
  const next = order.filter((id) => id !== dragging.value);
  next.splice(order.indexOf(over), 0, dragging.value);
  dragOrder.value = next;
}

async function onDragEnd() {
  const order = dragOrder.value;
  dragging.value = null;
  if (!order) return;
  const changed = order.some((id, i) => id !== store.widgets[i]?.id);
  if (changed) await save(order);
  dragOrder.value = null;
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

    <div v-else ref="grid" class="desk-widget-grid">
      <WidgetFrame
        v-for="(w, i) in shown"
        :key="w.id"
        :widget="w"
        :index="i"
        :count="shown.length"
        :at-limit="atLimit"
        :offline="offline"
        @move="onMove(w.id, $event)"
        @duplicate="onDuplicate(w.id)"
        @drag-start="onDragStart(w.id)"
        @drag-move="onDragMove"
        @drag-end="onDragEnd"
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

    <p class="desk-sr-only" aria-live="polite" data-testid="widget-live">{{ announcement }}</p>

    <p class="desk-widget-attribution"><slot name="attribution" /></p>

    <AddWidgetSheet
      :open="adding"
      :types="catalogue"
      :has-weather="store.widgets.some((w) => w.kind === 'weather')"
      :add="onAdd"
      @close="adding = false"
    />
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
.desk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
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
