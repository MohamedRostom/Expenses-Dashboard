<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    placement?: 'center' | 'bottom' | 'side';
    /** Catalogue mode: renders in place as a non-modal example (no Teleport, no trap). */
    inline?: boolean;
  }>(),
  { placement: 'center' },
);
const titleId = useId();
const emit = defineEmits<{ close: [] }>();

const dialogEl = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

/** Escape closes; focus moves into the dialog on open and back to whatever opened it on close —
 * previously neither happened, so a keyboard/screen-reader user landed nowhere on open and lost
 * their place on close. */
const FOCUSABLE = 'a[href], input, button, select, textarea, [tabindex]:not([tabindex="-1"])';

function onKeydown(e: KeyboardEvent): void {
  if (props.inline) return;
  if (e.key === 'Escape') emit('close');
  if (e.key !== 'Tab' || !dialogEl.value) return;
  // Focus trap: Tab past the last focusable wraps to the first, Shift+Tab before the first to the last.
  const items = [...dialogEl.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !(el as HTMLButtonElement).disabled,
  );
  if (!items.length) return e.preventDefault();
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === dialogEl.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (props.inline) return;
    if (isOpen) {
      lastFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      const target =
        dialogEl.value?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]') ??
        dialogEl.value;
      target?.focus();
    } else {
      lastFocused?.focus();
    }
  },
);
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <div
      v-if="open"
      class="desk-dialog-backdrop"
      :class="[`desk-dialog-backdrop--${placement}`, { 'desk-dialog-backdrop--inline': inline }]"
      @click.self="$emit('close')"
      @keydown="onKeydown"
    >
      <div
        ref="dialogEl"
        class="desk-dialog"
        :class="`desk-dialog--${placement}`"
        role="dialog"
        :aria-modal="inline ? 'false' : 'true'"
        :aria-label="title ? undefined : 'Dialog'"
        :aria-labelledby="title ? titleId : undefined"
        tabindex="-1"
      >
        <h2 v-if="title" :id="titleId" class="desk-dialog-header">{{ title }}</h2>
        <div class="desk-dialog-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.desk-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 40%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.desk-dialog {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  min-width: 280px;
  max-width: 90vw;
}
.desk-dialog-header {
  font-weight: 600;
  margin-bottom: var(--space-2);
}
.desk-dialog:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
/* Phone sheet: pinned to the bottom edge, full width, rounded top only. */
.desk-dialog-backdrop--bottom {
  align-items: flex-end;
}
.desk-dialog--bottom {
  width: 100%;
  max-width: 100%;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
/* Desktop panel: pinned to the right edge, full height. */
.desk-dialog-backdrop--side {
  align-items: stretch;
  justify-content: flex-end;
}
.desk-dialog--side {
  height: 100%;
  border-radius: 0;
}
/* Catalogue example: sits in the flow of its cell instead of covering the viewport. */
.desk-dialog-backdrop--inline {
  position: relative;
  inset: auto;
  z-index: auto;
  min-height: 16rem;
  background: var(--color-surface);
}
</style>
