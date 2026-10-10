<script setup lang="ts">
import { computed } from 'vue';
import { useToast, type ToastMessage } from '../composables/useToast.js';

const props = defineProps<{
  /** Catalogue mode: renders in place, from `messages` instead of the shared queue. */
  inline?: boolean;
  messages?: ToastMessage[];
}>();
const { toasts, dismiss, pause, resume } = useToast();
const shown = computed(() => props.messages ?? toasts);

// Timer pauses while hovered or focused; resumes only when neither holds it.
const held = new Map<number, { hover: boolean; focus: boolean }>();
function hold(id: number, key: 'hover' | 'focus', on: boolean) {
  const h = held.get(id) ?? { hover: false, focus: false };
  const was = h.hover || h.focus;
  h[key] = on;
  held.set(id, h);
  const now = h.hover || h.focus;
  if (now && !was) pause(id);
  else if (!now && was) resume(id);
}
function undo(t: ToastMessage) {
  t.undo?.();
  dismiss(t.id);
}
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <div class="desk-toast-stack" :class="{ 'desk-toast-stack--inline': inline }">
      <div
        v-for="t in shown"
        :key="t.id"
        class="desk-toast"
        :class="t.variant"
        :role="t.variant === 'critical' ? 'alert' : 'status'"
        @click="dismiss(t.id)"
        @mouseenter="hold(t.id, 'hover', true)"
        @mouseleave="hold(t.id, 'hover', false)"
        @focusin="hold(t.id, 'focus', true)"
        @focusout="hold(t.id, 'focus', false)"
      >
        {{ t.text }}
        <button v-if="t.undo" type="button" class="desk-toast-undo" @click.stop="undo(t)">
          Undo
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.desk-toast-stack {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 200;
}
.desk-toast {
  font-family: var(--font-sans);
  background: var(--color-fg);
  color: var(--color-bg);
  padding: 0.6rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
}
.desk-toast.warn {
  background: var(--color-warn);
}
.desk-toast.critical {
  background: var(--color-critical);
}
.desk-toast.success {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.desk-toast-undo {
  margin-left: var(--space-3);
  font: inherit;
  font-weight: 600;
  color: inherit;
  background: none;
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}
.desk-toast-undo:focus-visible,
.desk-toast:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
/* Catalogue example: sits in the flow of its cell. */
.desk-toast-stack--inline {
  position: static;
  z-index: auto;
  align-items: flex-start;
}
</style>
