<script setup lang="ts">
/** The widget frame: a raised flap with header, drag grip, menu and banner (DESIGN.md Components,
 * compact widget variant). Moved out of @desk/ui's PanelFrame (T042): the copy and the Categories
 * link are widget-specific. Loading and error bodies are PanelFrame states. */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { PanelFrame } from '@desk/ui';
import type { WidgetT } from '@desk/contracts';

const props = defineProps<{
  widget: Pick<WidgetT, 'id' | 'kind' | 'state' | 'cause' | 'asOf' | 'figures'>;
  index?: number;
  count?: number;
  atLimit?: boolean;
  offline?: boolean;
  /** The widget's place, shown beside the title instead of inside the figures. */
  subtitle?: string | undefined;
  /** Phones: the frame is one tappable line (`summary`) that expands to the full figures. */
  compact?: boolean;
  summary?: string | null;
}>();
const emit = defineEmits<{
  settings: [];
  remove: [];
  move: [dir: -1 | 1];
  duplicate: [];
  dragStart: [e: PointerEvent];
  dragMove: [e: PointerEvent];
  dragEnd: [e: PointerEvent];
}>();

const w = computed(() => props.widget);
const expanded = ref(false);
const bodyId = computed(() => `widget-body-${w.value.id}`);
const showBody = computed(() => !props.compact || expanded.value);

// A <details> menu stays open by itself: close it after a choice (focus back on the summary, so a
// dialog opened by the choice restores focus somewhere visible), on Escape, and on an outside click.
const menu = ref<HTMLDetailsElement | null>(null);
function closeMenu(refocus: boolean) {
  if (!menu.value?.open) return;
  menu.value.open = false;
  if (refocus) menu.value.querySelector('summary')?.focus();
}
function onItemClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) closeMenu(true);
}
function onOutsideClick(e: MouseEvent) {
  if (!menu.value?.contains(e.target as Node)) closeMenu(false);
}
onMounted(() => document.addEventListener('click', onOutsideClick));
onUnmounted(() => document.removeEventListener('click', onOutsideClick));
function onGripDown(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  emit('dragStart', e);
}

type Cause = NonNullable<WidgetT['cause']>;
const TITLES: Record<WidgetT['kind'], string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise and sunset',
  spend_pace: 'Spend pace',
  fixed_costs: 'Fixed costs',
};

const CAUSE_COPY: Record<Cause, string> = {
  rate_unavailable: 'No rate has been published for this date yet.',
  source_unreachable: "Couldn't reach the data source. Showing the last reading.",
  source_limit_reached: "The data source's daily limit is reached. Showing the last reading.",
  place_not_found: "This widget's place can't be found. Choose it again in settings.",
};

const frameTitle = computed(() => TITLES[w.value.kind]);
// asOf is server time; formatting it never consults the device clock.
const asOf = computed(() =>
  new Date(w.value.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
);
const hasFigures = computed(() => w.value.figures !== undefined);
// Sunrise and sunset times do not go out of date, so that widget has no as-of chip or stale note.
const timeless = computed(() => w.value.kind === 'sunrise');
// A stale reading with no specific cause is said once, in the as-of chip (lamp and words).
const staleChip = computed(
  () =>
    !timeless.value && w.value.state === 'stale' && !(w.value.cause && CAUSE_COPY[w.value.cause]),
);
const banner = computed(() => {
  const { state, cause } = w.value;
  if (props.offline && hasFigures.value) return "You're offline — showing the last reading";
  if (state === 'unavailable') return 'This widget is unavailable right now.';
  if (state === 'stale') return timeless.value || !cause ? null : (CAUSE_COPY[cause] ?? null);
  if (state === 'error' && hasFigures.value) {
    return (cause && CAUSE_COPY[cause]) || 'Something went wrong. Showing the last reading.';
  }
  return null;
});
// state 'empty' with no figures is a reading that has not arrived yet: show the skeleton.
// Spend pace and fixed costs have no external source: 'empty' there means nothing to show, not pending.
const body = computed<'figures' | 'loading' | 'error' | 'nothing'>(() => {
  if (hasFigures.value) return 'figures';
  const { state, kind } = w.value;
  if (state === 'empty' && (kind === 'spend_pace' || kind === 'fixed_costs')) return 'nothing';
  return state === 'error' ? 'error' : 'loading';
});
</script>

<template>
  <article
    class="desk-widget-frame surface"
    :class="{ 'desk-widget-frame--compact': compact }"
    data-testid="widget-frame"
    :data-state="w.state"
    :data-widget-id="w.id"
    :aria-label="frameTitle"
  >
    <header class="desk-widget-head">
      <span
        class="desk-widget-grip"
        data-testid="widget-grip"
        aria-hidden="true"
        @pointerdown="onGripDown"
        @pointermove="$emit('dragMove', $event)"
        @pointerup="$emit('dragEnd', $event)"
        @pointercancel="$emit('dragEnd', $event)"
        >&#8942;&#8942;</span
      >
      <h3 class="desk-widget-title">
        <button
          v-if="compact"
          type="button"
          class="desk-widget-toggle"
          data-testid="widget-toggle"
          :aria-expanded="expanded"
          :aria-controls="bodyId"
          @click="expanded = !expanded"
        >
          <span class="desk-widget-name" data-testid="widget-title">{{ frameTitle }}</span>
          <span v-if="summary" class="desk-widget-summary">{{ summary }}</span>
        </button>
        <template v-else>
          <span class="desk-widget-name" data-testid="widget-title">{{ frameTitle }}</span>
          <span v-if="subtitle" class="desk-widget-subtitle" data-testid="widget-subtitle">{{
            subtitle
          }}</span>
        </template>
      </h3>
      <span
        v-if="!timeless && (!compact || expanded || staleChip)"
        class="desk-widget-asof"
        :data-stale="staleChip || undefined"
        ><span v-if="staleChip" class="desk-widget-lamp" aria-hidden="true"></span
        >{{ staleChip ? `${asOf} · last reading` : `as of ${asOf}` }}</span
      >
      <details ref="menu" class="desk-widget-menu" @keydown.esc="closeMenu(true)">
        <summary :aria-label="`${frameTitle} menu`">&#8943;</summary>
        <div class="desk-widget-menu-items" @click.capture="onItemClick">
          <button type="button" :disabled="index === 0" @click="$emit('move', -1)">Move up</button>
          <button type="button" :disabled="index === (count ?? 0) - 1" @click="$emit('move', 1)">
            Move down
          </button>
          <button type="button" :disabled="atLimit" @click="$emit('duplicate')">Duplicate</button>
          <button type="button" @click="$emit('settings')">Settings</button>
          <button type="button" @click="$emit('remove')">Remove</button>
        </div>
      </details>
    </header>
    <p v-if="banner" class="desk-widget-banner" role="status">{{ banner }}</p>
    <div
      v-if="showBody"
      :id="bodyId"
      class="desk-widget-body"
      tabindex="0"
      role="region"
      :aria-label="`${frameTitle} figures`"
    >
      <slot v-if="body === 'figures'" />
      <p v-else-if="body === 'nothing'" class="desk-widget-nothing">
        {{ w.kind === 'spend_pace' ? 'No budget set.' : 'No fixed-cost categories yet.' }}
        <RouterLink to="/categories">{{
          w.kind === 'spend_pace'
            ? 'Set a budget in Categories'
            : 'Mark categories as fixed in Categories'
        }}</RouterLink>
      </p>
      <PanelFrame v-else-if="body === 'loading'" kind="loading" />
      <PanelFrame v-else kind="error" :code="w.cause ?? 'server_error'" />
    </div>
  </article>
</template>

<style scoped>
/* A raised flap with a fixed height: figures arriving never push the expenses below (FR-001). */
.desk-widget-frame {
  height: 12rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
/* The menu is taller than the frame, so the frame must not clip (only the body does). Every frame
 * is its own stacking context (backdrop-filter), so the open one rises above later frames and
 * panels (z 1) but stays under the bars (9, 10) and dialogs (100). */
.desk-widget-frame:has(.desk-widget-menu[open]) {
  position: relative;
  z-index: 5;
}
/* Grip, title and menu on one line; the as-of chip wraps to its own line under the title, so a
 * 14rem column never pushes the menu out of the frame. */
.desk-widget-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-2);
}
.desk-widget-title {
  min-inline-size: 0;
}
.desk-widget-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--target-min);
  min-block-size: var(--target-min);
  cursor: grab;
  touch-action: none;
  user-select: none;
  color: var(--color-fg-muted);
  letter-spacing: -0.2em;
}
.desk-widget-title {
  margin: 0;
  flex: 1;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-widget-subtitle {
  margin-inline-start: var(--space-2);
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}
/* Phones: the frame grows to its content; the page scrolls, never the widget. */
.desk-widget-frame--compact {
  height: auto;
}
.desk-widget-frame--compact .desk-widget-body {
  overflow: visible;
}
.desk-widget-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: start;
  cursor: pointer;
}
.desk-widget-summary {
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  font-variant-numeric: tabular-nums;
  color: var(--color-fg);
}
.desk-widget-asof[data-stale] {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-warn);
}
.desk-widget-lamp {
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}
.desk-widget-asof {
  order: 1;
  flex-basis: 100%;
  padding-inline-start: calc(var(--target-min) + var(--space-2));
  margin-block-start: calc(var(--space-2) * -1);
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  color: var(--color-fg-muted);
}
.desk-widget-menu {
  position: relative;
}
.desk-widget-menu summary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-min);
  min-inline-size: var(--target-min);
  cursor: pointer;
  list-style: none;
}
.desk-widget-menu-items {
  position: absolute;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-overlay);
  border-radius: var(--radius-field);
}
.desk-widget-menu-items button {
  background: none;
  border: none;
  color: var(--color-fg);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-align: left;
  white-space: nowrap;
  min-block-size: var(--target-min);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}
.desk-widget-menu-items button:disabled {
  color: var(--color-fg-muted);
  cursor: default;
}
/* Stale or failed with a last reading: amber, always in words. */
.desk-widget-banner {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  color: var(--color-warn);
}
.desk-widget-nothing {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-widget-body {
  flex: 1;
  min-height: 0;
  /* The frame keeps its fixed height (FR-001); figures that do not fit scroll instead of being cut off. */
  overflow-y: auto;
  scrollbar-width: thin;
}
.desk-widget-body:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-field);
}
</style>
