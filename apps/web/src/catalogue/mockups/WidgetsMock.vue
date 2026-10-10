<script setup lang="ts">
/** T027a: the widgets mock-up in the proposed identity. A strip you can reorder (drag or the move
 * buttons), remove from and add to, with two sheets; below it a static matrix of five widgets in
 * five states. Fixtures only: no API, no store. DOM contract: tests/e2e/tests/visual.spec.ts. */
import { computed, nextTick, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button, EmptyState } from '@desk/ui';
import BoardHeader from './BoardHeader.vue';
import WidgetFrame from './WidgetFrame.vue';
import WidgetSheets, { type Sheet } from './WidgetSheets.vue';
import { useMockLive } from './useMockLive.js';
import { useFlipList } from './useFlipList.js';
import { useReorder } from './useReorder.js';
import {
  DEFAULT_STRIP,
  PACE,
  WIDGET_KINDS,
  WIDGET_NAMES,
  WIDGET_STATES,
  type WidgetKind,
  type WidgetState,
} from '../fixtures-widgets.js';
import './board.css';
import './widgets.css';

const route = useRoute();
const query = (k: string) => String(route.query[k] ?? '');
const stripState = computed<WidgetState>(() => {
  const s = query('state');
  return s === 'loading' || s === 'empty' || s === 'error' || s === 'stale' ? s : 'default';
});

const items = ref<WidgetKind[]>([...DEFAULT_STRIP]);
// Only the widgets present at load settle in; one added later just enters (mk-list-enter).
const initial = new Set<WidgetKind>(items.value);
const sheet = ref<Sheet | null>(
  query('sheet') === 'add-widget' || query('sheet') === 'widget-settings'
    ? (query('sheet') as Sheet)
    : null,
);
const settingsKind = ref<WidgetKind | null>(
  sheet.value === 'widget-settings' ? items.value[0]! : null,
);
const absent = computed(() => WIDGET_KINDS.filter((k) => !items.value.includes(k)));

const live = useMockLive({ monthDays: PACE.monthDays, startDay: PACE.startDay });
const panel = ref<HTMLElement | null>(null);
const grid = ref<HTMLElement | null>(null);
const flip = useFlipList(() => grid.value);
const announce = ref('');
const reordering = ref(false); // FLIP owns reorder glides; the list's own move transition owns add/remove

// Pointer reorder: slotAt picks the nearest widget centre, so it works in a one- or two-column grid.
let px = 0;
function slotAt(y: number) {
  let best = 0;
  let nearest = Infinity;
  grid.value?.querySelectorAll('[data-widget]').forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const d = Math.hypot(px - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d < nearest) [nearest, best] = [d, i];
  });
  return best;
}
const reorder = useReorder(items, slotAt);
const { dragIndex, overIndex } = reorder;

async function settle(kind: WidgetKind, refocus?: string) {
  announce.value = `${WIDGET_NAMES[kind]} moved to position ${items.value.indexOf(kind) + 1} of ${items.value.length}`;
  await nextTick();
  flip.play();
  reordering.value = false;
  if (refocus)
    grid.value
      ?.querySelector<HTMLElement>(`[data-widget="${kind}"] [aria-label="${refocus}"]`)
      ?.focus();
}
function step(i: number, dir: -1 | 1) {
  const kind = items.value[i]!;
  flip.first();
  reordering.value = true;
  if (dir < 0) reorder.moveEarlier(i);
  else reorder.moveLater(i);
  void settle(kind, `Move ${WIDGET_NAMES[kind]} ${dir < 0 ? 'earlier' : 'later'}`);
}
function onDown(i: number, e: PointerEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
  px = e.clientX;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  reorder.dragStart(i, e);
}
function onMove(e: PointerEvent) {
  px = e.clientX;
  reorder.dragMove(e);
}
function onUp(e: PointerEvent) {
  if (dragIndex.value === null) return;
  px = e.clientX;
  const kind = items.value[dragIndex.value]!;
  flip.first();
  reordering.value = true;
  reorder.dragEnd(e);
  void settle(kind);
}

function remove(kind: WidgetKind) {
  initial.delete(kind);
  items.value = items.value.filter((k) => k !== kind);
  announce.value = `${WIDGET_NAMES[kind]} removed`;
  void nextTick(() =>
    panel.value?.querySelector<HTMLElement>('[data-testid="add-widget"]')?.focus(),
  );
}
function add(kind: WidgetKind) {
  items.value = [...items.value, kind];
  announce.value = `${WIDGET_NAMES[kind]} added at position ${items.value.length}`;
  sheet.value = null;
}
function openSettings(kind: WidgetKind) {
  settingsKind.value = kind;
  sheet.value = 'widget-settings';
}
</script>

<template>
  <div data-mockup-root>
    <div data-mockup="widgets">
      <BoardHeader current="month" />
      <main class="mk-main">
        <h1 class="mk-title">Widgets</h1>

        <section
          ref="panel"
          class="mk-panel"
          data-mockup-panel="strip"
          aria-labelledby="wg-strip-title"
        >
          <div class="mk-panel-head">
            <h2 id="wg-strip-title" class="mk-title">Strip</h2>
            <Button
              variant="secondary"
              size="sm"
              data-testid="add-widget"
              @click="sheet = 'add-widget'"
              >Add widget</Button
            >
          </div>
          <p class="mk-sr" role="status" aria-live="polite">{{ announce }}</p>
          <div ref="grid">
            <TransitionGroup
              v-if="items.length"
              name="mk-list"
              tag="div"
              class="wg-grid"
              :move-class="reordering ? 'wg-nomove' : 'mk-list-move'"
            >
              <WidgetFrame
                v-for="(kind, i) in items"
                :key="kind"
                :kind="kind"
                :state="stripState"
                :live="live"
                controls
                :first="i === 0"
                :last="i === items.length - 1"
                :index="initial.has(kind) ? i : undefined"
                :dragging="dragIndex === i"
                :over="overIndex === i && dragIndex !== null && dragIndex !== i"
                @earlier="step(i, -1)"
                @later="step(i, 1)"
                @remove="remove(kind)"
                @settings="openSettings(kind)"
                @pointerdown="onDown(i, $event)"
                @pointermove="onMove"
                @pointerup="onUp"
                @pointercancel="onUp"
              />
            </TransitionGroup>
            <EmptyState
              v-else
              title="No widgets on the strip"
              description="Add one to see it here."
            />
          </div>
        </section>

        <section class="mk-panel" data-mockup-panel="matrix" aria-labelledby="wg-matrix-title">
          <h2 id="wg-matrix-title" class="mk-title">Every widget in every state</h2>
          <div v-for="s in WIDGET_STATES" :key="s" class="wg-row">
            <p class="mk-label">{{ s }}</p>
            <div class="wg-matrix-grid">
              <WidgetFrame v-for="k in WIDGET_KINDS" :key="k" :kind="k" :state="s" sample />
            </div>
          </div>
        </section>
      </main>

      <WidgetSheets
        :sheet="sheet"
        :absent="absent"
        :kind="settingsKind"
        @close="sheet = null"
        @add="add"
      />
    </div>
  </div>
</template>
