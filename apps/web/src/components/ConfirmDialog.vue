<script setup lang="ts">
/** The in-app replacement for the native confirm dialog: an opaque dialog (focus in, Escape cancels, focus
 * restored by Dialog) with Cancel first so the safe answer is the one under the cursor. */
import { Button, Dialog } from '@desk/ui';

defineProps<{ open: boolean; title: string; confirmLabel: string }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Dialog :open="open" :title="title" @close="emit('cancel')">
    <div class="desk-confirm-body"><slot /></div>
    <div class="desk-confirm-actions">
      <Button variant="secondary" @click="emit('cancel')">Cancel</Button>
      <Button variant="danger" @click="emit('confirm')">{{ confirmLabel }}</Button>
    </div>
  </Dialog>
</template>

<style scoped>
.desk-confirm-body {
  max-width: 28rem;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-confirm-body :deep(p) {
  margin: 0;
}
.desk-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
</style>
