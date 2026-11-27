<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Dialog, PanelFrame, Select, Skeleton, useToast } from '@desk/ui';
import {
  NotionConnectOutcome,
  type ListNotionDatabasesResponseT,
  type NotionConnectOutcomeT,
  type NotionConnectionResponseT,
  type NotionDirectionT,
  type SyncNotionResponseT,
} from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';

const toast = useToast();
const route = useRoute();
const router = useRouter();

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

const unavailable = ref(false);
// The ?notion=<outcome> the OAuth callback redirected back with; read once, then dropped from the URL.
const outcome = ref<NotionConnectOutcomeT | null>(null);
const outcomeCopy: Record<NotionConnectOutcomeT, { text: string; action?: string }> = {
  connected: { text: 'Connected to Notion.' },
  no_pages: {
    text: 'No pages were shared with Desk.',
    action: 'Reconnect to choose pages',
  },
  denied: { text: "Notion wasn't connected.", action: 'Try again' },
  expired: { text: 'That connection attempt expired. Try again.', action: 'Try again' },
  failed: { text: "Couldn't connect to Notion. Try again.", action: 'Try again' },
  unavailable: { text: "Notion sync isn't available on this server yet." },
};
const notice = computed(() => {
  const o = outcome.value;
  if (!o || o === 'unavailable') return null;
  const c = outcomeCopy[o];
  return o === 'connected' && connection.value?.workspaceName
    ? { ...c, text: `Connected to ${connection.value.workspaceName}.` }
    : c;
});

const viewState = computed<
  'loading' | 'unavailable' | 'not_connected' | 'reconnect_needed' | 'connected'
>(() =>
  loading.value
    ? 'loading'
    : unavailable.value
      ? 'unavailable'
      : !connected.value
        ? 'not_connected'
        : connection.value?.status === 'reconnect_needed'
          ? 'reconnect_needed'
          : 'connected',
);
const liveMessage = computed(
  () =>
    ({
      loading: 'Loading Notion connection…',
      unavailable: "Notion sync isn't available on this server yet.",
      not_connected: 'Notion is not connected.',
      reconnect_needed: 'Notion needs to be reconnected.',
      connected: 'Notion is connected.',
    })[viewState.value],
);

async function load() {
  loading.value = true;
  unavailable.value = false;
  try {
    const res = await apiFetch<{ connection: NotionConnectionResponseT }>('/notion/connection');
    connection.value = res.connection;
    connected.value = res.connection.status !== 'disconnected';
    direction.value = res.connection.direction;
    if (connected.value && res.connection.status !== 'reconnect_needed') await loadDatabases();
  } catch (err) {
    connection.value = null;
    connected.value = false;
    if (err instanceof ApiError && err.code === 'feature_unavailable') {
      unavailable.value = true;
    } else if (err instanceof ApiError && err.code === 'not_found') {
      // not connected: nothing to show beyond the Connect prompt
    } else {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to load Notion connection.',
        'critical',
      );
    }
  } finally {
    if (outcome.value === 'unavailable') unavailable.value = true;
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
    // 409: Notion no longer accepts the connection; the API has marked it reconnect_needed.
    if (err instanceof ApiError && err.code === 'conflict' && connection.value) {
      connection.value = { ...connection.value, status: 'reconnect_needed' };
      return;
    }
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
    if (res.status === 'reconnect_needed') {
      toast.push('Notion no longer accepts this connection. Reconnect Notion to sync.', 'critical');
    } else {
      toast.push(
        res.status === 'error'
          ? `Sync failed: ${res.lastError ?? 'unknown error'}`
          : `Synced (${res.applied} applied, ${res.skipped} skipped).`,
        res.status === 'error' ? 'critical' : undefined,
      );
    }
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

onMounted(() => {
  const parsed = NotionConnectOutcome.safeParse(route.query.notion);
  if (parsed.success) outcome.value = parsed.data;
  // Drop the parameter (valid or not) so a refresh doesn't replay the message.
  if (route.query.notion !== undefined) {
    const query = { ...route.query };
    delete query.notion;
    void router.replace({ query });
  }
  void load();
});
</script>

<template>
  <main class="desk-connectors">
    <div class="desk-connectors-grid board-grid">
      <p class="desk-sr-only" role="status" aria-live="polite">{{ liveMessage }}</p>

      <PanelFrame v-if="notice" heading="Notion connection">
        <p
          class="desk-connectors-notice desk-connectors-body"
          role="status"
          :data-outcome="outcome"
        >
          {{ notice.text }}
          <Button v-if="notice.action" variant="secondary" size="sm" @click="connect">{{
            notice.action
          }}</Button>
        </p>
      </PanelFrame>

      <PanelFrame v-if="viewState === 'loading'" heading="Notion">
        <div class="desk-connectors-body" aria-busy="true">
          <Skeleton height="1.25rem" />
          <Skeleton height="2.5rem" />
        </div>
      </PanelFrame>

      <PanelFrame v-else-if="viewState === 'unavailable'" heading="Notion">
        <div class="desk-connectors-body">
          <p>Notion sync isn't available on this server yet.</p>
          <div><Button disabled>Connect Notion</Button></div>
        </div>
      </PanelFrame>

      <PanelFrame v-else-if="viewState === 'not_connected'" heading="Notion">
        <div class="desk-connectors-body">
          <p>Connect a Notion workspace to keep expenses in sync with a Notion database.</p>
          <div><Button @click="connect">Connect Notion</Button></div>
        </div>
      </PanelFrame>

      <PanelFrame v-else-if="viewState === 'reconnect_needed'" heading="Notion">
        <div class="desk-connectors-body">
          <p>Desk lost access to {{ connection?.workspaceName ?? 'your Notion workspace' }}.</p>
          <div><Button @click="connect">Reconnect Notion</Button></div>
        </div>
      </PanelFrame>

      <template v-else>
        <PanelFrame heading="Connection">
          <dl class="desk-connectors-status desk-connectors-body">
            <dt>Workspace</dt>
            <dd>{{ connection?.workspaceName }}</dd>
            <dt>Status</dt>
            <dd :class="`desk-status-${connection?.status}`">{{ connection?.status }}</dd>
            <dt>Last sync</dt>
            <dd>{{ connection?.lastSyncAt ?? 'never' }}</dd>
            <dt v-if="connection?.lastError">Last error</dt>
            <dd v-if="connection?.lastError" role="alert">{{ connection?.lastError }}</dd>
          </dl>
        </PanelFrame>

        <PanelFrame heading="Sync">
          <div class="desk-connectors-table desk-connectors-body">
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

          <div class="desk-connectors-actions desk-connectors-body">
            <Button :loading="syncing" @click="syncNow">Sync now</Button>
            <Button variant="secondary" @click="disconnectOpen = true">Disconnect</Button>
          </div>
        </PanelFrame>
      </template>
    </div>

    <Dialog :open="disconnectOpen" title="Disconnect Notion?" @close="disconnectOpen = false">
      <p>Existing synced expenses and their history are kept — only syncing stops.</p>
      <div class="desk-connectors-actions">
        <Button variant="danger" @click="disconnect">Disconnect</Button>
        <Button variant="secondary" @click="disconnectOpen = false">Cancel</Button>
      </div>
    </Dialog>
  </main>
</template>

<style scoped>
.desk-sr-only {
  position: absolute;
  font-size: var(--text-md);
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.desk-connectors {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
p {
  margin: 0;
}
.desk-connectors-body {
  padding: var(--space-2) var(--space-4);
}
.desk-connectors-body > * + * {
  margin-top: var(--space-3);
}
.desk-connectors-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
}
.desk-connectors-grid {
  inline-size: 100%;
  max-width: none;
  margin-inline: 0;
  align-items: start;
}
.desk-connectors-status {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-connectors-status dt {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-connectors-status dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.desk-status-error {
  padding-inline-start: var(--space-2);
  border-inline-start: var(--space-1) solid var(--color-critical);
}
.desk-status-connected {
  padding-inline-start: var(--space-2);
  border-inline-start: var(--space-1) solid var(--color-accent);
}
.desk-connectors-table,
.desk-connectors-actions {
  display: flex;
  gap: var(--space-3);
  align-items: end;
  flex-wrap: wrap;
}
</style>
