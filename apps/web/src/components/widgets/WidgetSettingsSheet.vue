<script setup lang="ts">
import { Dialog } from '@desk/ui';
import type { WidgetPatchT, WidgetT } from '@desk/contracts';
import { useWidgetsStore } from '../../stores/widgets.js';

const props = defineProps<{ open: boolean; widget: WidgetT | null }>();
defineEmits<{ close: [] }>();
const store = useWidgetsStore();

/** Changes apply immediately: the kind's settings component calls `patch` on each change. */
function patch(body: WidgetPatchT) {
  return store.patch(props.widget!.id, body);
}
</script>

<template>
  <Dialog :open="open && widget !== null" title="Widget settings" @close="$emit('close')">
    <!-- Per-kind settings components (US1, US2) fill this slot; only this widget's options. -->
    <slot v-if="widget" :widget="widget" :patch="patch">
      <p>This widget has no options.</p>
    </slot>
  </Dialog>
</template>
