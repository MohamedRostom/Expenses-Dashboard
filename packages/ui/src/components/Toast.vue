<script setup lang="ts">
import { computed } from 'vue';
import Button from './Button.vue';
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
    <TransitionGroup
      name="desk-toast"
      tag="div"
      class="desk-toast-stack"
      :class="{ 'desk-toast-stack--inline': inline }"
    >
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
        <Button
          v-if="t.undo"
          variant="ghost"
          size="sm"
          class="desk-toast-undo"
          @click.stop="undo(t)"
        >
          Undo
        </Button>
      </div>
    </TransitionGroup>
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
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  background: var(--color-surface-raised);
  color: var(--color-fg);
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  box-shadow: var(--shadow-overlay);
}
/* The 4px leading lamp carries the status: green saved, amber, red. */
.desk-toast.success {
  border-left-color: var(--color-accent);
}
.desk-toast.warn {
  border-left-color: var(--color-warn);
}
.desk-toast.critical {
  border-left-color: var(--color-critical);
}
.desk-toast:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-toast-enter-from,
.desk-toast-leave-to {
  opacity: 0;
}
.desk-toast-enter-from {
  transform: translateY(8px);
}
.desk-toast-leave-to {
  transform: translateY(8px);
}
.desk-toast-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}
.desk-toast-leave-active {
  transition: opacity var(--motion-fast) var(--ease-exit);
}
/* Catalogue example: sits in the flow of its cell. */
.desk-toast-stack--inline {
  position: static;
  z-index: auto;
  align-items: flex-start;
}
</style>
