<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import {
  PROVIDER_PRIVACY_TEXT,
  type ProviderT,
  type AccountT,
  type CapabilityT,
} from '@desk/contracts';
import { Button, PALETTE_COLOURS, PanelFrame } from '@desk/ui';
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
  <main class="connections-view">
    <h1>Connected Accounts</h1>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="errorCode" class="error-banner" role="alert">{{ connectErrorCopy(errorCode) }}</div>

    <div v-if="connectedAccount" class="success-banner">
      <p>Account connected successfully.</p>
      <p>
        Capabilities granted: {{ connectedAccount.capabilities.join(', ') || 'none' }}<br />
        Scopes granted: {{ connectedAccount.grantedScopes.join(', ') || 'none' }}
      </p>
    </div>
    <div v-else-if="connected" class="success-banner">Account connected successfully</div>

    <div class="connections-grid board-grid">
      <PanelFrame heading="Add a provider" class="providers">
        <div class="panel-body">
          <p v-if="isLimitReached" class="limit-message">
            You can connect up to 10 accounts. Disconnect an account to add another.
          </p>

          <div class="provider-grid">
            <div v-for="provider in providers" :key="provider.id" class="provider-card">
              <h4>{{ providerName(provider.id) }}</h4>
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
                <Button
                  :disabled="isLimitReached"
                  @click="navigateToOAuth(provider.id, 'calendar')"
                >
                  Connect Calendar
                </Button>
                <p v-if="!provider.capabilities.includes('mail')" class="note">
                  Gmail is currently disabled pending a security assessment. Check back soon.
                </p>
              </div>

              <div v-else-if="provider.id === 'standards'" class="capabilities">
                <Button :disabled="isLimitReached" @click="showStandardsForm = true">
                  Add another provider
                </Button>
              </div>

              <div v-else class="capabilities">
                <Button
                  :disabled="isLimitReached"
                  @click="navigateToOAuth(provider.id, provider.capabilities.join(','))"
                >
                  Connect {{ providerName(provider.id) }}
                </Button>
              </div>
            </div>
          </div>

          <StandardsForm
            v-if="showStandardsForm && standardsProvider"
            :presets="standardsProvider.presets ?? []"
            class="standards-form-panel"
            @success="onStandardsConnected"
          />
        </div>
      </PanelFrame>

      <PanelFrame heading="Your accounts" class="accounts">
        <div class="panel-body">
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
                  <p class="provider">
                    {{ providerName(account.provider) }} · {{ account.address }}
                  </p>
                </div>
                <div class="account-status" :class="account.status">
                  {{ statusLabel(account.status) }}
                </div>
              </div>

              <div
                role="radiogroup"
                class="colour-group"
                :aria-label="`Colour for ${account.label}`"
              >
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
                <Button variant="secondary" @click="togglePause(account)">
                  {{ account.status === 'paused' ? 'Resume' : 'Pause' }}
                </Button>

                <Button
                  v-if="account.status === 'reconnect_needed' || account.status === 'error'"
                  variant="secondary"
                  @click="startReconnect(account.id)"
                >
                  Reconnect
                </Button>

                <a
                  v-for="capability in missingCapabilities(account)"
                  :key="capability"
                  class="add-capability-link"
                  :href="addCapabilityUrl(account, capability)"
                >
                  Add {{ capabilityLabel(capability) }}
                </a>

                <Button variant="danger" @click="askDisconnect(account)">Disconnect</Button>
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
        </div>
      </PanelFrame>
    </div>

    <dialog v-if="disconnectTarget" open class="disconnect-dialog" aria-label="Disconnect account">
      <p>
        Disconnect {{ disconnectTarget.label }} ({{ disconnectTarget.address }})? This removes the
        stored credential and every cached message and event for this account.
      </p>
      <p v-if="revokeInstructionsFor(disconnectTarget.provider)">
        {{ revokeInstructionsFor(disconnectTarget.provider) }}
      </p>
      <div class="dialog-actions">
        <Button variant="secondary" @click="cancelDisconnect">Cancel</Button>
        <Button variant="danger" @click="confirmDisconnect">Disconnect</Button>
      </div>
    </dialog>
  </main>
</template>

<style scoped>
.connections-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
h1,
h4 {
  margin: 0;
}
h1 {
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
h4 {
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
}
.connections-grid {
  inline-size: 100%;
  max-width: none;
  margin-inline: 0;
  align-items: start;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
p {
  margin: 0;
}
.error-banner,
.success-banner {
  padding: var(--space-1) var(--space-3);
  border-inline-start: var(--space-1) solid var(--color-accent);
}
.error-banner {
  border-inline-start-color: var(--color-critical);
}
.limit-message,
.note,
.provider {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.provider-grid {
  display: flex;
  flex-direction: column;
}
/* Items inside a panel are ruled rows, not nested boxes. */
.provider-card,
.account-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block: var(--space-4);
  border-top: 1px solid var(--color-border);
  min-width: 0;
}
.provider-card:first-child,
.account-card:first-child {
  border-top: 0;
  padding-top: var(--space-2);
}
.privacy-details summary {
  display: flex;
  align-items: center;
  min-height: var(--target-min);
  cursor: pointer;
  text-decoration: underline;
}
.privacy-details dl {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.privacy-details dt {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.privacy-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.capabilities {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}
.empty-state {
  color: var(--color-fg-muted);
}
.accounts-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.account-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.label-input {
  min-height: var(--target-min);
  box-sizing: border-box;
  max-width: 100%;
  font: inherit;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-fg);
  padding: var(--space-1) var(--space-2);
  margin-inline-start: calc(-1 * var(--space-2));
}
.label-input:hover,
.label-input:focus {
  border-color: var(--color-border);
  border-radius: var(--radius-sm);
}
.label-input:focus-visible,
.calendar-item input:focus-visible,
.colour-swatch:focus-visible,
.add-capability-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.account-status {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  white-space: nowrap;
  padding-inline-start: var(--space-2);
  border-inline-start: var(--space-1) solid var(--color-accent);
}
.account-status.reconnect_needed,
.account-status.paused {
  border-inline-start-color: var(--color-warn);
}
.account-status.error {
  border-inline-start-color: var(--color-critical);
}
.colour-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
/* The 44px target is the button; the swatch is drawn inside it. */
.colour-swatch {
  position: relative;
  width: var(--target-min);
  height: var(--target-min);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.colour-swatch::after {
  content: '';
  position: absolute;
  inset: var(--space-2);
  background: var(--swatch-color);
  border-radius: var(--radius-md);
  outline: 2px solid transparent;
  outline-offset: 2px;
}
.colour-swatch[aria-checked='true']::after {
  outline-color: var(--color-fg);
}
.account-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.calendar-checklist {
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.checklist-title {
  margin-bottom: var(--space-1);
  font-weight: 600;
}
.calendar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
}
.primary-tag {
  color: var(--color-fg-muted);
}
.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
.add-capability-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  color: var(--color-fg);
  text-decoration: underline;
  font-size: var(--text-sm);
  font-weight: 600;
}
.standards-form-panel {
  margin-top: var(--space-2);
}
.disconnect-dialog {
  max-width: 26rem;
  padding: var(--space-6);
  border: 0;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  color: var(--color-fg);
  background: var(--color-surface-raised);
}
.disconnect-dialog::backdrop {
  background: var(--color-fg);
  opacity: 0.4;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
@media (min-width: 1024px) {
  .add-capability-link,
  .privacy-details summary,
  .calendar-item {
    min-height: 24px;
  }
}
</style>
