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
    <table v-else class="desk-version-table">
      <caption class="desk-version-caption">
        Notion sync history
      </caption>
      <tbody>
        <tr v-for="v in versions" :key="v.id">
          <th scope="row" class="desk-version-source">{{ v.source }}</th>
          <td>
            <time :datetime="v.editedAt">{{ formatDateTime(v.editedAt) }}</time>
          </td>
        </tr>
      </tbody>
    </table>
  </details>
</template>

<style scoped>
.desk-version-history {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-fg);
}
.desk-version-history summary {
  min-height: var(--target-min);
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
}
.desk-version-history summary:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-version-table {
  width: 100%;
  border-collapse: collapse;
}
.desk-version-caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.desk-version-table th,
.desk-version-table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-version-source {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-version-table td {
  text-align: right;
}
@media (min-width: 1024px) {
  .desk-version-history summary {
    min-height: var(--space-6);
  }
}
</style>
