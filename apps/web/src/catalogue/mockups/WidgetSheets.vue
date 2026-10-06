<script setup lang="ts">
/** The add-widget and widget-settings sheets (T027a). Dialog semantics: role="dialog", Escape closes,
 * Tab is trapped, focus goes in on open and back to the opener on close. No Teleport: the sheet sits
 * inside the proposed wrapper so it takes the theme tokens. */
import { computed, nextTick, ref, watch } from 'vue';
import { Button } from '@desk/ui';
import { SETTINGS, WIDGET_NAMES, type WidgetKind } from '../fixtures-widgets.js';
import './widgets.css';

export type Sheet = 'add-widget' | 'widget-settings';
const props = defineProps<{ sheet: Sheet | null; absent: WidgetKind[]; kind: WidgetKind | null }>();
const emit = defineEmits<{ close: []; add: [kind: WidgetKind] }>();

const panel = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
const label = computed(() =>
  props.sheet === 'add-widget'
    ? 'Add a widget'
    : `${props.kind ? WIDGET_NAMES[props.kind] : 'Widget'} settings`,
);
const FOCUSABLE = 'button, select, input, [href], [tabindex]:not([tabindex="-1"])';
const focusables = () =>
  [...(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
    (e) => e.getAttribute('aria-disabled') !== 'true',
  );

watch(
  () => props.sheet,
  async (now, was) => {
    if (now && !was) {
      // the opener still holds focus: the sheet has not moved it yet
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      (focusables()[0] ?? panel.value)?.focus();
    } else if (!now && was) {
      if (opener?.isConnected) opener.focus();
      opener = null;
    }
  },
  { flush: 'post' },
);
// Opened at load (?sheet=): nothing to restore, but focus still goes in.
if (props.sheet) nextTick(() => (focusables()[0] ?? panel.value)?.focus());

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  } else if (e.key === 'Tab') {
    const f = focusables();
    if (!f.length) return e.preventDefault();
    const at = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && at <= 0) {
      e.preventDefault();
      f[f.length - 1]!.focus();
    } else if (!e.shiftKey && at === f.length - 1) {
      e.preventDefault();
      f[0]!.focus();
    }
  }
}
const BLURB: Record<WidgetKind, string> = {
  currency: 'A rate you follow, with its day and 30-day change.',
  weather: 'Now, today and the next three days.',
  sunrise: 'Sunrise, sunset and day length.',
  'spend-pace': 'Spent so far against the month.',
  'fixed-costs': 'Fixed categories not yet paid.',
};
</script>

<template>
  <Transition name="wg-scrim">
    <div v-if="sheet" class="wg-scrim" @click="emit('close')"></div>
  </Transition>
  <Transition name="mk-sheet">
    <div
      v-if="sheet"
      ref="panel"
      class="wg-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      tabindex="-1"
      @keydown="onKey"
    >
      <h2 class="mk-title">{{ label }}</h2>

      <template v-if="sheet === 'add-widget'">
        <ul v-if="absent.length" class="wg-sheet-list">
          <li v-for="k in absent" :key="k">
            <button type="button" class="wg-btn" @click="emit('add', k)">
              {{ WIDGET_NAMES[k] }}
            </button>
            <span class="mk-note">{{ BLURB[k] }}</span>
          </li>
        </ul>
        <p v-else class="mk-note">Every widget is already on the strip.</p>
      </template>

      <template v-else-if="kind">
        <label v-for="f in SETTINGS[kind]" :key="f.label" class="wg-field">
          <span class="mk-label">{{ f.label }}</span>
          <select>
            <option v-for="o in f.options" :key="o">{{ o }}</option>
          </select>
        </label>
      </template>

      <Button variant="secondary" @click="emit('close')">Close</Button>
    </div>
  </Transition>
</template>
