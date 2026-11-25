<script setup lang="ts">
/** Lists the single-key shortcuts MonthView listens for; opened with "?". */
import { Button, Dialog } from '@desk/ui';
import { SHORTCUTS } from '../composables/useShortcuts.js';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Dialog :open="open" title="Keyboard shortcuts" @close="emit('close')">
    <dl class="desk-shortcuts">
      <template v-for="s in SHORTCUTS" :key="s.key">
        <dt>
          <kbd>{{ s.key }}</kbd>
        </dt>
        <dd>{{ s.label }}</dd>
      </template>
    </dl>
    <div class="desk-shortcuts-actions">
      <Button variant="secondary" @click="emit('close')">Close</Button>
    </div>
  </Dialog>
</template>

<style scoped>
.desk-shortcuts {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  font-size: var(--text-sm);
}
.desk-shortcuts dt,
.desk-shortcuts dd {
  margin: 0;
}
.desk-shortcuts kbd {
  display: inline-block;
  min-width: var(--space-6);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-field);
  background: var(--color-surface);
  font-family: var(--font-mono);
  text-align: center;
}
.desk-shortcuts-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
</style>
