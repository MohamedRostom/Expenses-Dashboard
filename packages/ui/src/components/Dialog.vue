<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();

const dialogEl = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

/** Escape closes; focus moves into the dialog on open and back to whatever opened it on close —
 * previously neither happened, so a keyboard/screen-reader user landed nowhere on open and lost
 * their place on close. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

watch(
  () => props.open,
  async (isOpen) => {
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
  <Teleport to="body">
    <div v-if="open" class="desk-dialog-backdrop" @click.self="$emit('close')" @keydown="onKeydown">
      <div
        ref="dialogEl"
        class="desk-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title ? undefined : 'Dialog'"
        :aria-labelledby="title ? 'desk-dialog-title' : undefined"
        tabindex="-1"
      >
        <h2 v-if="title" id="desk-dialog-title" class="desk-dialog-header">{{ title }}</h2>
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
  border-radius: 8px;
  padding: 1rem;
  min-width: 280px;
  max-width: 90vw;
}
.desk-dialog-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
}
</style>
