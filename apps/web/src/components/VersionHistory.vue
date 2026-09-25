<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ExpenseVersionT } from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';
import { formatDateTime } from '../utils/format.js';

const props = defineProps<{ expenseId: string }>();

const versions = ref<ExpenseVersionT[]>([]);
const loading = ref(true);
const loadError = ref('');

onMounted(async () => {
  try {
    const res = await apiFetch<{ versions: ExpenseVersionT[] }>(
      `/expenses/${props.expenseId}/versions`,
    );
    versions.value = res.versions;
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'Failed to load version history.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <details class="desk-version-history">
    <summary>Notion sync history</summary>
    <p v-if="loading">Loading…</p>
    <p v-else-if="loadError" role="alert">{{ loadError }}</p>
    <p v-else-if="versions.length === 0">No sync history yet.</p>
    <ul v-else>
      <li v-for="v in versions" :key="v.id">
        <span class="desk-version-source">{{ v.source }}</span>
        <time :datetime="v.editedAt">{{ formatDateTime(v.editedAt) }}</time>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.desk-version-history {
  font-family: var(--font-sans);
  font-size: 0.85rem;
  color: var(--color-fg);
}
.desk-version-history ul {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.desk-version-source {
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-size: 0.75rem;
  opacity: 0.75;
  margin-right: 0.5rem;
}
</style>
