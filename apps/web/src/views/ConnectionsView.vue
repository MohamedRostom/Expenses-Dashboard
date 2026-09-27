<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import {
  PROVIDER_PRIVACY_TEXT,
  type ProviderT,
  type AccountT,
  type CapabilityT,
} from '@desk/contracts';
import { PALETTE_COLOURS } from '@desk/ui';
import {
  getConnections,
  getProviders,
  postReconnect,
  patchConnection,
  deleteConnection,
} from '../api/connections.js';
import { accountErrorCopy, connectErrorCopy } from '../utils/errors.js';
import { revokeInstructionsFor } from '../utils/privacy-text.js';
import StandardsForm from '../components/connections/StandardsForm.vue';

const providers = ref<ProviderT[]>([]);
const accounts = ref<AccountT[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const connected = ref<string | null>(null);
const errorCode = ref<string | null>(null);
const passwordNeededFor = ref<string | null>(null);
const disconnectTarget = ref<AccountT | null>(null);
const showStandardsForm = ref(false);

const isLimitReached = computed(() => accounts.value.length >= 10);
const connectedAccount = computed(() =>
  connected.value ? (accounts.value.find((a) => a.id === connected.value) ?? null) : null,
);
const standardsProvider = computed(() => providers.value.find((p) => p.id === 'standards'));
const reconnectAccount = computed(() => {
  const account = accounts.value.find((a) => a.id === passwordNeededFor.value);
  if (!account) return null;
  return { id: account.id, address: account.address, capabilities: account.capabilities };
});

/** Marks an account connected the same way an OAuth callback redirect does
 * (`?connected=<id>`, contracts/api.md `GET /connections/:provider/callback`), so a
 * standards-based connect or reconnect lands the user in the same state without a page reload. */
function landAsConnected(account: AccountT) {
  const idx = accounts.value.findIndex((a) => a.id === account.id);
  if (idx === -1) accounts.value.push(account);
  else accounts.value[idx] = account;
  connected.value = account.id;
  const url = new URL(window.location.href);
  url.searchParams.set('connected', account.id);
  window.history.replaceState({}, '', url.toString());
}

function onStandardsConnected(account: AccountT) {
  showStandardsForm.value = false;
  landAsConnected(account);
}

function onStandardsReconnected(account: AccountT) {
  passwordNeededFor.value = null;
  landAsConnected(account);
}

onMounted(async () => {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  connected.value = params.get('connected');
  errorCode.value = params.get('error');

  // T084: a link cannot POST, so the Today payload's reconnectUrl points here with
  // ?reconnect=<id>, and this page starts the reconnect flow on the user's behalf.
  const reconnectId = params.get('reconnect');
  if (reconnectId && accounts.value.some((a) => a.id === reconnectId)) {
    const url = new URL(window.location.href);
    url.searchParams.delete('reconnect');
    window.history.replaceState({}, '', url.toString());
    await startReconnect(reconnectId);
  }
});

// The same action the "Reconnect" button on an account card triggers.
async function startReconnect(accountId: string) {
  try {
    const res = await postReconnect(accountId);
    if ('url' in res) {
      window.location.href = res.url;
    } else {
      passwordNeededFor.value = accountId;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reconnect';
  }
}

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

/** The capabilities this account's provider can offer (per flags) that this account was not
 * granted, so an "Add mail"/"Add calendar" link can be offered (FR-001). */
function missingCapabilities(account: AccountT): CapabilityT[] {
  const provider = providers.value.find((p) => p.id === account.provider);
  if (!provider) return [];
  return provider.capabilities.filter((c) => !account.capabilities.includes(c));
}

function addCapabilityUrl(account: AccountT, capability: CapabilityT): string {
  return `/connections/${account.provider}/start?capabilities=${capability}&account=${account.id}`;
}

function capabilityLabel(capability: CapabilityT): string {
  return capability === 'mail' ? 'mail' : 'calendar';
}

async function applyPatch(account: AccountT, patch: Parameters<typeof patchConnection>[1]) {
  try {
    const res = await patchConnection(account.id, patch);
    const idx = accounts.value.findIndex((a) => a.id === account.id);
    if (idx !== -1) accounts.value[idx] = res.account;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save change';
  }
}

function onLabelChange(account: AccountT, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  void applyPatch(account, { label: value });
}

function togglePause(account: AccountT) {
  void applyPatch(account, { paused: account.status !== 'paused' });
}

function toggleCalendar(account: AccountT, calendarId: string, event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  void applyPatch(account, { calendars: [{ id: calendarId, enabled }] });
}

// Colour radio group (FR-024): roving tabindex, operable with the arrow keys, each colour named.
function selectColour(account: AccountT, colourId: string) {
  if (account.colour === colourId) return;
  void applyPatch(account, { colour: colourId });
}

function onColourKeydown(account: AccountT, index: number, event: KeyboardEvent) {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !backward) return;
  event.preventDefault();
  const count = PALETTE_COLOURS.length;
  const nextIndex = forward ? (index + 1) % count : (index - 1 + count) % count;
  const groupEl = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]');
  const radios = groupEl?.querySelectorAll<HTMLElement>('[role="radio"]');
  const nextEl = radios?.[nextIndex];
  nextEl?.focus();
  selectColour(account, PALETTE_COLOURS[nextIndex]!.id);
}

function askDisconnect(account: AccountT) {
  disconnectTarget.value = account;
}

function cancelDisconnect() {
  disconnectTarget.value = null;
}

async function confirmDisconnect() {
  const account = disconnectTarget.value;
  if (!account) return;
  try {
    await deleteConnection(account.id);
    accounts.value = accounts.value.filter((a) => a.id !== account.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to disconnect';
  } finally {
    disconnectTarget.value = null;
  }
}
</script>

<template>
  <div class="connections-view">
    <h1>Connected Accounts</h1>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="errorCode" class="error-banner">{{ connectErrorCopy(errorCode) }}</div>

    <div v-if="connectedAccount" class="success-banner">
      <p>Account connected successfully.</p>
      <p>
        Capabilities granted: {{ connectedAccount.capabilities.join(', ') || 'none' }}<br />
        Scopes granted: {{ connectedAccount.grantedScopes.join(', ') || 'none' }}
      </p>
    </div>
    <div v-else-if="connected" class="success-banner">Account connected successfully</div>

    <section class="providers">
      <h2>Add a Provider</h2>
      <p v-if="isLimitReached" class="limit-message">
        You can connect up to 10 accounts. Disconnect an account to add another.
      </p>

      <div class="provider-grid">
        <div v-for="provider in providers" :key="provider.id" class="provider-card">
          <h3>{{ providerName(provider.id) }}</h3>
          <!-- T073/FR-016: same source as the landing privacy page. -->
          <details class="privacy-details">
            <summary>What Desk reads and stores</summary>
            <dl>
              <dt>Reads</dt>
              <dd class="reads">{{ PROVIDER_PRIVACY_TEXT[provider.id].reads }}</dd>
              <dt>Stores</dt>
              <dd class="stores">{{ PROVIDER_PRIVACY_TEXT[provider.id].stores }}</dd>
              <dt>How long</dt>
              <dd class="retention">{{ PROVIDER_PRIVACY_TEXT[provider.id].retention }}</dd>
              <dt>Revoking access</dt>
              <dd class="revoke">{{ PROVIDER_PRIVACY_TEXT[provider.id].revoke }}</dd>
              <dt>Permissions</dt>
              <dd class="scopes">
                <ul>
                  <li v-for="scope in PROVIDER_PRIVACY_TEXT[provider.id].scopes" :key="scope">
                    {{ scope }}
                  </li>
                </ul>
              </dd>
            </dl>
          </details>

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

          <div v-else-if="provider.id === 'standards'" class="capabilities">
            <button
              type="button"
              :disabled="isLimitReached"
              class="connect-btn"
              @click="showStandardsForm = true"
            >
              Add another provider
            </button>
          </div>

          <div v-else class="capabilities">
            <button
              type="button"
              :disabled="isLimitReached"
              class="connect-btn"
              @click="navigateToOAuth(provider.id, provider.capabilities.join(','))"
            >
              Connect {{ providerName(provider.id) }}
            </button>
          </div>
        </div>
      </div>

      <StandardsForm
        v-if="showStandardsForm && standardsProvider"
        :presets="standardsProvider.presets ?? []"
        class="standards-form-panel"
        @success="onStandardsConnected"
      />
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
              <input
                type="text"
                class="label-input"
                aria-label="Account label"
                :value="account.label"
                @change="onLabelChange(account, $event)"
              />
              <p class="provider">{{ providerName(account.provider) }} · {{ account.address }}</p>
            </div>
            <div class="account-status" :class="account.status">
              {{ statusLabel(account.status) }}
            </div>
          </div>

          <div role="radiogroup" class="colour-group" :aria-label="`Colour for ${account.label}`">
            <button
              v-for="(swatch, index) in PALETTE_COLOURS"
              :key="swatch.id"
              type="button"
              role="radio"
              class="colour-swatch"
              :style="{ '--swatch-color': `var(--palette-${swatch.id})` }"
              :aria-checked="account.colour === swatch.id"
              :aria-label="swatch.name"
              :tabindex="account.colour === swatch.id ? 0 : -1"
              @click="selectColour(account, swatch.id)"
              @keydown="onColourKeydown(account, index, $event)"
            ></button>
          </div>

          <div class="account-details">
            <div><strong>Capabilities:</strong> {{ account.capabilities.join(', ') }}</div>
            <div v-if="account.lastRefreshAt">
              <strong>Last refresh:</strong> {{ formatDate(account.lastRefreshAt) }}
            </div>
            <div v-if="account.lastError">
              <strong>Error:</strong> {{ accountErrorCopy(account.lastError) }}
            </div>
          </div>

          <div v-if="account.calendars.length > 0" class="calendar-checklist">
            <p class="checklist-title">Calendars shown on Today</p>
            <label v-for="cal in account.calendars" :key="cal.id" class="calendar-item">
              <input
                type="checkbox"
                :aria-label="cal.name"
                :checked="cal.enabled"
                @change="toggleCalendar(account, cal.id, $event)"
              />
              {{ cal.name }}<span v-if="cal.isPrimary" class="primary-tag"> (primary)</span>
            </label>
          </div>

          <div class="account-actions">
            <button type="button" class="pause-btn" @click="togglePause(account)">
              {{ account.status === 'paused' ? 'Resume' : 'Pause' }}
            </button>

            <button
              v-if="account.status === 'reconnect_needed' || account.status === 'error'"
              type="button"
              class="reconnect-btn"
              @click="startReconnect(account.id)"
            >
              Reconnect
            </button>

            <a
              v-for="capability in missingCapabilities(account)"
              :key="capability"
              class="add-capability-link"
              :href="addCapabilityUrl(account, capability)"
            >
              Add {{ capabilityLabel(capability) }}
            </a>

            <button type="button" class="disconnect-btn" @click="askDisconnect(account)">
              Disconnect
            </button>
          </div>

          <StandardsForm
            v-if="passwordNeededFor === account.id && reconnectAccount"
            mode="reconnect"
            :presets="[]"
            :reconnect-account="reconnectAccount"
            class="standards-form-panel"
            @success="onStandardsReconnected"
          />
        </div>
      </div>
    </section>

    <dialog v-if="disconnectTarget" open class="disconnect-dialog" aria-label="Disconnect account">
      <p>
        Disconnect {{ disconnectTarget.label }} ({{ disconnectTarget.address }})? This removes the
        stored credential and every cached message and event for this account.
      </p>
      <p v-if="revokeInstructionsFor(disconnectTarget.provider)">
        {{ revokeInstructionsFor(disconnectTarget.provider) }}
      </p>
      <div class="dialog-actions">
        <button type="button" @click="cancelDisconnect">Cancel</button>
        <button type="button" class="disconnect-confirm-btn" @click="confirmDisconnect">
          Disconnect
        </button>
      </div>
    </dialog>
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

.label-input {
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-fg);
  padding: 0.1rem 0.3rem;
  margin: 0 0 0 -0.3rem;
}

.label-input:hover,
.label-input:focus {
  border-color: var(--color-border);
  border-radius: 0.25rem;
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

.colour-group {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.colour-swatch {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--swatch-color);
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}

.colour-swatch[aria-checked='true'] {
  border-color: var(--color-fg);
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

.calendar-checklist {
  margin-top: 1rem;
  font-size: 0.875rem;
}

.checklist-title {
  margin: 0 0 0.4rem 0;
  font-weight: 600;
}

.calendar-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0;
}

.primary-tag {
  color: var(--color-fg-secondary);
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
  align-items: center;
}

.pause-btn,
.reconnect-btn,
.disconnect-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: 0.4rem;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}

.disconnect-btn {
  color: var(--color-critical);
  border-color: var(--color-critical);
}

.pause-btn:hover,
.reconnect-btn:hover {
  background: var(--color-bg-tertiary, rgba(0, 0, 0, 0.05));
}

.add-capability-link {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  color: var(--color-fg);
  text-decoration: none;
  font-size: 0.9rem;
}

.standards-form-panel {
  margin-top: 1rem;
}

.disconnect-dialog {
  border: none;
  border-radius: 0.5rem;
  padding: 1.5rem;
  max-width: 420px;
  color: var(--color-fg);
  background: var(--color-bg);
}

.disconnect-dialog::backdrop {
  background: rgb(0 0 0 / 40%);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.disconnect-confirm-btn {
  background: var(--color-critical);
  color: white;
  border: none;
  border-radius: 0.4rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}
</style>
