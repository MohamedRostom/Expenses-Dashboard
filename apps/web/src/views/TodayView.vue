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
  <main class="today-view">
    <div class="panels board-grid">
      <CalendarPanel />
      <InboxPanel />
    </div>
    <WidgetStrip v-if="settled" />
    <div aria-live="polite" aria-atomic="true" class="sr-only">
      {{ today.loading ? 'Loading panels...' : 'Panels loaded' }}
    </div>
  </main>
</template>

<style scoped>
.today-view {
  padding: var(--space-4) var(--gutter);
  max-width: var(--content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
