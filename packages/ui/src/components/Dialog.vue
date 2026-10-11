<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    /** `sheet`: a bottom sheet on phones, a side panel from 1024px. */
    placement?: 'center' | 'bottom' | 'side' | 'sheet';
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
    <Transition name="desk-dialog">
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
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Scrim: Board Ink at 40%. The panel is a raised flap on the Overlay shadow, 8px on free edges. */
.desk-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, black 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.desk-dialog {
  box-sizing: border-box;
  font-family: var(--font-sans);
  background: var(--color-surface-raised);
  color: var(--color-fg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  padding: var(--space-4);
  min-width: 280px;
  max-width: 90vw;
  max-height: 90dvh;
  overflow-y: auto;
}
.desk-dialog-header {
  margin: 0 0 var(--space-4);
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
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
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
/* Desktop panel: pinned to the right edge, full height. */
.desk-dialog-backdrop--side {
  align-items: stretch;
  justify-content: flex-end;
}
.desk-dialog--side {
  height: 100%;
  max-height: 100dvh;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}
/* Responsive sheet: bottom at phone width, side panel from 1024px. */
.desk-dialog-backdrop--sheet {
  align-items: flex-end;
}
.desk-dialog--sheet {
  width: 100%;
  max-width: 100%;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
@media (min-width: 1024px) {
  .desk-dialog-backdrop--sheet {
    align-items: stretch;
    justify-content: flex-end;
  }
  .desk-dialog--sheet {
    width: 28rem;
    max-width: 100%;
    height: 100%;
    max-height: 100dvh;
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }
}
/* Catalogue example: sits in the flow of its cell instead of covering the viewport. */
.desk-dialog-backdrop--inline {
  position: relative;
  inset: auto;
  z-index: auto;
  min-height: 16rem;
  background: var(--color-surface);
}
/* Slide in on the slow token; the scrim fades by background colour (never by opacity, so the
   text inside keeps its contrast while the sheet moves). Tokens are 0ms under reduced motion. */
.desk-dialog-enter-active,
.desk-dialog-leave-active {
  transition: background-color var(--motion-slow) var(--ease-standard);
}
.desk-dialog-enter-active .desk-dialog,
.desk-dialog-leave-active .desk-dialog {
  transition: transform var(--motion-slow) var(--ease-standard);
}
.desk-dialog-enter-from,
.desk-dialog-leave-to {
  background-color: transparent;
}
.desk-dialog-enter-from .desk-dialog--bottom,
.desk-dialog-leave-to .desk-dialog--bottom,
.desk-dialog-enter-from .desk-dialog--sheet,
.desk-dialog-leave-to .desk-dialog--sheet {
  transform: translateY(100%);
}
.desk-dialog-enter-from .desk-dialog--side,
.desk-dialog-leave-to .desk-dialog--side {
  transform: translateX(100%);
}
.desk-dialog-enter-from .desk-dialog--center,
.desk-dialog-leave-to .desk-dialog--center {
  transform: translateY(var(--space-2));
}
@media (min-width: 1024px) {
  .desk-dialog-enter-from .desk-dialog--sheet,
  .desk-dialog-leave-to .desk-dialog--sheet {
    transform: translateX(100%);
  }
}
</style>
