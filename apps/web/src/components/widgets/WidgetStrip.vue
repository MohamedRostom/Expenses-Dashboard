<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Button, useToast, PanelFrame } from '@desk/ui';
import type { WidgetCreateT, WidgetTypeT } from '@desk/contracts';
import { ApiError } from '../../api/client.js';
import { useWidgetsStore } from '../../stores/widgets.js';
import CurrencyWidget from './CurrencyWidget.vue';
import WeatherWidget from './WeatherWidget.vue';
import SunriseWidget from './SunriseWidget.vue';
import SpendPaceWidget from './SpendPaceWidget.vue';
import FixedCostsWidget from './FixedCostsWidget.vue';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';
import { WEATHER_ATTRIBUTION } from '@desk/contracts';
import { useSessionStore } from '../../stores/session.js';
import { clockIn, summary } from './widget-summary.js';
import ConfirmDialog from '../ConfirmDialog.vue';
import WidgetFrame from './WidgetFrame.vue';
import AddWidgetSheet from './AddWidgetSheet.vue';
import WidgetSettingsSheet from './WidgetSettingsSheet.vue';

const store = useWidgetsStore();
const toast = useToast();
const catalogue = ref<WidgetTypeT[]>([]);
const typesError = ref<PanelErrorKind | null>(null);
const adding = ref(false);
const settingsId = ref<string | null>(null);
const loaded = ref(false);
const session = useSessionStore();

// Phones: each widget is one tappable summary line (the page scrolls, never a widget).
const phone = typeof matchMedia === 'function' ? matchMedia('(max-width: 767px)') : null;
const compact = ref(phone?.matches ?? false);
const onPhone = (e: MediaQueryListEvent) => (compact.value = e.matches);
// Sun times are relative to now, so the strip ticks once a minute.
const now = ref(new Date());
let tick: ReturnType<typeof setInterval> | undefined;
type Placed = { figures?: { place?: string; placeTimeZone?: string } };
const placeOf = (w: unknown) => (w as Placed).figures?.place;
const zoneOf = (w: unknown) =>
  (w as Placed).figures?.placeTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
const wall = (w: unknown) => clockIn(zoneOf(w), now.value);
// The Open-Meteo credit (CC-BY) is said once for the strip, not inside every widget.
const credit = computed(() =>
  store.widgets.some((w) => (w.kind === 'weather' || w.kind === 'sunrise') && w.figures)
    ? WEATHER_ATTRIBUTION
    : null,
);

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
const settingsWidget = computed(() => store.widgets.find((w) => w.id === settingsId.value) ?? null);

// Refresh button: the server re-fetches the sources, then the strip reloads. Figures also refresh
// on their own: the strip polls every five minutes and the server refreshes rates hourly.
const refreshing = ref(false);
async function refresh() {
  refreshing.value = true;
  try {
    await store.refreshNow();
  } catch {
    // store.error carries the failure; the strip shows it.
  } finally {
    refreshing.value = false;
  }
}

onMounted(async () => {
  // The catalogue is independent of the widget list; fetch both at once.
  const types = store.types().catch((err) => {
    typesError.value = toPanelErrorKind(err);
    return [];
  });
  try {
    await store.load();
  } catch {
    // store.error carries the kind of failure; a failed strip stays quiet, the month view is intact.
  }
  loaded.value = true;
  window.addEventListener('online', bump);
  window.addEventListener('offline', bump);
  store.start();
  phone?.addEventListener('change', onPhone);
  tick = setInterval(() => (now.value = new Date()), 60_000);
  catalogue.value = await types;
});
onUnmounted(() => {
  window.removeEventListener('online', bump);
  window.removeEventListener('offline', bump);
  store.stop();
  phone?.removeEventListener('change', onPhone);
  clearInterval(tick);
});

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

async function onAdd(body: WidgetCreateT) {
  await store.add(body); // rejections surface inside the sheet
  adding.value = false;
}

// `removing` keeps its value after close so the title does not blank while the dialog fades out.
const removing = ref<{ id: string; name: string } | null>(null);
const removeOpen = ref(false);
function askRemove(id: string, name: string) {
  removing.value = { id, name };
  removeOpen.value = true;
}
async function confirmRemove() {
  removeOpen.value = false;
  const target = removing.value;
  if (!target) return;
  try {
    await store.remove(target.id);
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
        :variant="store.widgets.length === 0 ? 'ghost' : 'secondary'"
        :disabled="atLimit"
        @click="adding = true"
      >
        Add widget ({{ store.widgets.length }} of {{ store.limit }})
      </Button>
      <Button
        v-if="store.widgets.length > 0"
        data-testid="refresh-widgets"
        class="desk-widget-refresh"
        variant="ghost"
        aria-label="Refresh widgets"
        title="Refresh widgets"
        :disabled="refreshing"
        :aria-busy="refreshing || undefined"
        @click="refresh"
        ><span aria-hidden="true">&#8635;</span></Button
      >
    </div>

    <PanelFrame
      v-if="store.error && store.widgets.length === 0"
      kind="error"
      :code="offline ? 'offline' : store.error"
    />

    <div v-else-if="store.widgets.length > 0" ref="grid" class="desk-widget-grid">
      <WidgetFrame
        v-for="(w, i) in shown"
        :key="w.id"
        :widget="w"
        :index="i"
        :count="shown.length"
        :at-limit="atLimit"
        :offline="offline"
        :subtitle="placeOf(w)"
        :compact="compact"
        :summary="summary(w, store.temperatureUnit, wall(w))"
        @move="onMove(w.id, $event)"
        @duplicate="onDuplicate(w.id)"
        @drag-start="onDragStart(w.id)"
        @drag-move="onDragMove"
        @drag-end="onDragEnd"
        @settings="settingsId = w.id"
        @remove="askRemove(w.id, label(w.kind))"
      >
        <!-- WidgetFrame shows the skeleton/error when figures are absent. -->
        <CurrencyWidget
          v-if="w.kind === 'currency' && w.figures"
          :rows="w.figures.rows"
          :default-code="session.user?.defaultCurrency"
        />
        <WeatherWidget
          v-else-if="w.kind === 'weather' && w.figures"
          :figures="w.figures"
          :unit="store.temperatureUnit"
        />
        <SunriseWidget
          v-else-if="w.kind === 'sunrise' && w.figures"
          :figures="w.figures"
          :now="wall(w)"
        />
        <SpendPaceWidget v-else-if="w.kind === 'spend_pace' && w.figures" :figures="w.figures" />
        <FixedCostsWidget v-else-if="w.kind === 'fixed_costs' && w.figures" :figures="w.figures" />
      </WidgetFrame>
    </div>

    <p class="desk-sr-only" aria-live="polite" data-testid="widget-live">{{ announcement }}</p>

    <p v-if="credit || $slots.attribution" class="desk-widget-attribution">
      <slot name="attribution">{{ credit }}</slot>
    </p>

    <AddWidgetSheet
      :open="adding"
      :types="catalogue"
      :types-error="typesError"
      :has-weather="store.widgets.some((w) => w.kind === 'weather')"
      :add="onAdd"
      @close="adding = false"
    />
    <ConfirmDialog
      :open="removeOpen"
      :title="`Remove the ${removing?.name.toLowerCase() ?? ''} widget?`"
      confirm-label="Remove"
      @confirm="confirmRemove"
      @cancel="removeOpen = false"
    >
      <p>You can add it again from Add widget.</p>
    </ConfirmDialog>
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
  gap: var(--space-3);
}
.desk-widget-strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.desk-widget-refresh {
  inline-size: var(--target-min);
  min-inline-size: var(--target-min);
  padding-inline: 0;
  justify-content: center;
  font-size: var(--text-lg);
}
.desk-widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--space-3);
}
.desk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.desk-widget-attribution {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-widget-attribution:empty {
  display: none;
}
</style>
