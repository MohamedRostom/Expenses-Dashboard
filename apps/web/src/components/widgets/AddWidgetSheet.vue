<script setup lang="ts">
import { Dialog, Button } from '@desk/ui';
import type { WidgetKindT, WidgetTypeT } from '@desk/contracts';

defineProps<{ open: boolean; types: WidgetTypeT[] }>();
defineEmits<{ close: []; add: [kind: WidgetKindT] }>();

// A static example per kind, so the catalogue shows what a widget looks like before adding it.
const PREVIEW: Record<WidgetKindT, string> = {
  currency: '£1 = €1.17  +0.2% today',
  weather: '14°  Light rain  H 16° L 9°',
  sunrise: 'Sunrise 06:58  Sunset 18:21',
  spend_pace: '62% of budget, 9 days left',
  fixed_costs: '3 fixed costs still to pay',
};
</script>

<template>
  <Dialog :open="open" title="Add widget" @close="$emit('close')">
    <ul class="desk-add-widget-list">
      <li v-for="t in types.filter((x) => x.enabled)" :key="t.kind" class="desk-add-widget-item">
        <div>
          <p class="desk-add-widget-name">{{ t.name }}</p>
          <p class="desk-add-widget-desc">{{ t.description }}</p>
          <p class="desk-add-widget-preview" aria-label="Example">{{ PREVIEW[t.kind] }}</p>
        </div>
        <Button @click="$emit('add', t.kind)">Add</Button>
      </li>
    </ul>
  </Dialog>
</template>

<style scoped>
.desk-add-widget-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.desk-add-widget-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.desk-add-widget-name {
  margin: 0;
  font-weight: 600;
}
.desk-add-widget-desc {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}
.desk-add-widget-preview {
  margin: 0.2rem 0 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  opacity: 0.7;
}
</style>
