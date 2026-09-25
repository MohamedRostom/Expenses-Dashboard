<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button, Dialog, Select, useToast } from '@desk/ui';
import type {
  ListNotionDatabasesResponseT,
  NotionConnectionResponseT,
  NotionDirectionT,
  SyncNotionResponseT,
} from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';

const toast = useToast();

const connection = ref<NotionConnectionResponseT | null>(null);
const connected = ref(false);
const loading = ref(true);
const databases = ref<ListNotionDatabasesResponseT['databases']>([]);
const selectedDatabaseId = ref('');
const direction = ref<NotionDirectionT>('both');
const syncing = ref(false);
const disconnectOpen = ref(false);

const directionOptions = [
  { value: 'to_notion', label: 'Desk to Notion only' },
  { value: 'from_notion', label: 'Notion to Desk only' },
  { value: 'both', label: 'Both ways' },
];

async function load() {
  loading.value = true;
  try {
    const res = await apiFetch<{ connection: NotionConnectionResponseT }>('/notion/connection');
    connection.value = res.connection;
    connected.value = res.connection.status !== 'disconnected';
    direction.value = res.connection.direction;
    if (connected.value) await loadDatabases();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      connection.value = null;
      connected.value = false;
    } else {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to load Notion connection.',
        'critical',
      );
    }
  } finally {
    loading.value = false;
  }
}

async function loadDatabases() {
  try {
    const res = await apiFetch<ListNotionDatabasesResponseT>('/notion/databases');
    databases.value = res.databases;
    if (!selectedDatabaseId.value && connection.value?.databaseId) {
      selectedDatabaseId.value = connection.value.databaseId;
    }
  } catch (err) {
    toast.push(
      err instanceof ApiError ? err.message : 'Failed to load Notion databases.',
      'critical',
    );
  }
}

function connect() {
  window.location.href = '/notion/start';
}

async function saveTable() {
  const chosen = databases.value.find((d) => d.databaseId === selectedDatabaseId.value);
  if (!chosen) return;
  try {
    await apiFetch('/notion/connection', {
      method: 'PUT',
      body: JSON.stringify({
        databaseId: chosen.databaseId,
        dataSourceId: chosen.dataSourceId,
        direction: direction.value,
      }),
    });
    toast.push('Notion table connected.');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to set Notion table.', 'critical');
  }
}

async function syncNow() {
  syncing.value = true;
  try {
    const res = await apiFetch<SyncNotionResponseT>('/notion/sync', { method: 'POST' });
    toast.push(
      res.status === 'error'
        ? `Sync failed: ${res.lastError ?? 'unknown error'}`
        : `Synced (${res.applied} applied, ${res.skipped} skipped).`,
      res.status === 'error' ? 'critical' : undefined,
    );
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Sync failed.', 'critical');
  } finally {
    syncing.value = false;
  }
}

async function disconnect() {
  try {
    await apiFetch('/notion/connection', { method: 'DELETE' });
    toast.push('Disconnected from Notion.');
    disconnectOpen.value = false;
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to disconnect.', 'critical');
  }
}

onMounted(load);
</script>

<template>
  <section class="desk-connectors">
    <h2>Notion sync</h2>

    <p v-if="loading">Loading…</p>

    <template v-else-if="!connected">
      <p>Connect a Notion workspace to keep expenses in sync with a Notion database.</p>
      <Button @click="connect">Connect Notion</Button>
    </template>

    <template v-else>
      <dl class="desk-connectors-status">
        <dt>Workspace</dt>
        <dd>{{ connection?.workspaceName }}</dd>
        <dt>Status</dt>
        <dd :class="`desk-status-${connection?.status}`">{{ connection?.status }}</dd>
        <dt>Last sync</dt>
        <dd>{{ connection?.lastSyncAt ?? 'never' }}</dd>
        <dt v-if="connection?.lastError">Last error</dt>
        <dd v-if="connection?.lastError" role="alert">{{ connection?.lastError }}</dd>
      </dl>

      <div class="desk-connectors-table">
        <Select
          v-model="selectedDatabaseId"
          label="Notion database"
          :options="
            databases.map((d) => ({
              value: d.databaseId,
              label: `${d.title}${d.compatible ? '' : ' (incompatible)'}`,
            }))
          "
        />
        <Select v-model="direction" label="Sync direction" :options="directionOptions" />
        <Button :disabled="!selectedDatabaseId" @click="saveTable">Save table</Button>
      </div>

      <div class="desk-connectors-actions">
        <Button :loading="syncing" @click="syncNow">Sync now</Button>
        <Button variant="secondary" @click="disconnectOpen = true">Disconnect</Button>
      </div>

      <Dialog :open="disconnectOpen" title="Disconnect Notion?" @close="disconnectOpen = false">
        <p>Existing synced expenses and their history are kept — only syncing stops.</p>
        <div class="desk-connectors-actions">
          <Button variant="danger" @click="disconnect">Disconnect</Button>
          <Button variant="secondary" @click="disconnectOpen = false">Cancel</Button>
        </div>
      </Dialog>
    </template>
  </section>
</template>

<style scoped>
.desk-connectors {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  max-width: 32rem;
}
.desk-connectors-status {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  font-size: 0.9rem;
}
.desk-status-error {
  color: var(--color-critical);
}
.desk-status-connected {
  color: var(--color-accent);
}
.desk-connectors-table,
.desk-connectors-actions {
  display: flex;
  gap: 0.75rem;
  align-items: end;
  flex-wrap: wrap;
}
</style>
