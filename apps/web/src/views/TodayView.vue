<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { useTodayStore } from '../stores/today.js';
import CalendarPanel from '../components/today/CalendarPanel.vue';
import InboxPanel from '../components/today/InboxPanel.vue';

const WidgetStrip = defineAsyncComponent(() => import('../components/widgets/WidgetStrip.vue'));

const today = useTodayStore();
/** The strip waits for the panels to settle (loaded or failed) so it never delays them (R14). */
const settled = ref(false);

onMounted(async () => {
  try {
    await today.load();
  } finally {
    settled.value = true;
  }
  today.refreshIfStale(new Date());
});

onUnmounted(() => {
  today.stop();
});
</script>

<template>
  <div class="today-view">
    <div class="panels">
      <CalendarPanel />
      <InboxPanel />
    </div>
    <WidgetStrip v-if="settled" />
    <div aria-live="polite" aria-atomic="true" class="sr-only">
      {{ today.loading ? 'Loading panels...' : 'Panels loaded' }}
    </div>
  </div>
</template>

<style scoped>
.today-view {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
}

@media (max-width: 768px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
