<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import type { ProviderT, AccountT } from '@desk/contracts';
import { getConnections, getProviders } from '../api/connections.js';

const providers = ref<ProviderT[]>([]);
const accounts = ref<AccountT[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const connected = ref<string | null>(null);

const isLimitReached = computed(() => accounts.value.length >= 10);

onMounted(async () => {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  connected.value = params.get('connected');
});

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [providersRes, connectionsRes] = await Promise.all([getProviders(), getConnections()]);
    providers.value = providersRes.providers;
    accounts.value = connectionsRes.accounts;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load connections';
  } finally {
    loading.value = false;
  }
}

function providerName(id: string): string {
  const names: Record<string, string> = {
    google: 'Google',
    microsoft: 'Microsoft',
    standards: 'Standards-Based',
  };
  return names[id] || id;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    connected: 'Connected',
    reconnect_needed: 'Reconnect needed',
    error: 'Error',
    paused: 'Paused',
  };
  return labels[status] || status;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function navigateToOAuth(providerId: string, capability?: string) {
  let url = `/connections/${providerId}/start`;
  if (capability) {
    url += `?capabilities=${capability}`;
  }
  window.location.href = url;
}
</script>

<template>
  <div class="connections-view">
    <h1>Connected Accounts</h1>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="connected" class="success-banner">Account connected successfully</div>

    <section class="providers">
      <h2>Add a Provider</h2>
      <p v-if="isLimitReached" class="limit-message">
        You can connect up to 10 accounts. Disconnect an account to add another.
      </p>

      <div class="provider-grid">
        <div v-for="provider in providers" :key="provider.id" class="provider-card">
          <h3>{{ providerName(provider.id) }}</h3>

          <div v-if="provider.id === 'google'" class="capabilities">
            <button
              type="button"
              :disabled="isLimitReached"
              class="connect-btn"
              @click="navigateToOAuth(provider.id, 'calendar')"
            >
              Connect Calendar
            </button>
            <p v-if="!provider.capabilities.includes('mail')" class="note">
              Gmail is currently disabled pending a security assessment. Check back soon.
            </p>
          </div>

          <div v-else class="capabilities">
            <button
              type="button"
              :disabled="isLimitReached"
              class="connect-btn"
              @click="navigateToOAuth(provider.id)"
            >
              Connect {{ providerName(provider.id) }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="accounts">
      <h2>Your Accounts</h2>

      <div v-if="accounts.length === 0" class="empty-state">
        <p>No accounts connected yet. Connect a provider above to get started.</p>
      </div>

      <div v-else class="accounts-list">
        <div v-for="account in accounts" :key="account.id" class="account-card">
          <div class="account-header">
            <div>
              <h3>{{ account.label || account.address }}</h3>
              <p class="provider">{{ providerName(account.provider) }} · {{ account.address }}</p>
            </div>
            <div class="account-status" :class="account.status">
              {{ statusLabel(account.status) }}
            </div>
          </div>

          <div class="account-details">
            <div><strong>Capabilities:</strong> {{ account.capabilities.join(', ') }}</div>
            <div v-if="account.lastRefreshAt">
              <strong>Last refresh:</strong> {{ formatDate(account.lastRefreshAt) }}
            </div>
            <div v-if="account.lastError"><strong>Error:</strong> {{ account.lastError }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.connections-view {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

h1 {
  margin-top: 0;
}

.error-banner,
.success-banner {
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.error-banner {
  background: #ffe0e0;
  color: #a83a2e;
}

.success-banner {
  background: #e0ffe0;
  color: #2d6b2f;
}

section {
  margin-bottom: 2rem;
}

h2 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
}

.limit-message {
  color: var(--color-fg-secondary);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.provider-card {
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-secondary);
}

.provider-card h3 {
  margin: 0 0 1rem 0;
}

.capabilities {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.connect-btn {
  padding: 0.75rem 1rem;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 0.4rem;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connect-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.note {
  font-size: 0.85rem;
  color: var(--color-fg-secondary);
  margin: 0;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-fg-secondary);
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.account-card {
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-secondary);
}

.account-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}

.account-header h3 {
  margin: 0;
  font-size: 1rem;
}

.provider {
  font-size: 0.875rem;
  color: var(--color-fg-secondary);
  margin: 0.25rem 0 0 0;
}

.account-status {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.account-status.connected {
  background: #e0ffe0;
  color: #2d6b2f;
}

.account-status.reconnect_needed {
  background: #fff0e0;
  color: #a8641a;
}

.account-status.error {
  background: #ffe0e0;
  color: #a83a2e;
}

.account-status.paused {
  background: #f0f0f0;
  color: #666;
}

.account-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.account-details div {
  display: flex;
  gap: 0.5rem;
}
</style>
