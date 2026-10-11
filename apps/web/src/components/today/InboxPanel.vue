<script setup lang="ts">
import { PanelFrame } from '@desk/ui';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { TodayAccountT, TodayMessageT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';
import { formatDateTime } from '../../utils/format.js';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

// Offline: the last messages stay, under a note with the inbox's own words; Refresh is paused.
const online = ref(typeof navigator === 'undefined' || navigator.onLine !== false);
const setOnline = () => (online.value = navigator.onLine !== false);
onMounted(() => {
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
});
onUnmounted(() => {
  window.removeEventListener('online', setOnline);
  window.removeEventListener('offline', setOnline);
});
const frameKind = computed(() => {
  if (today.loading || today.purged) return 'loading' as const;
  return today.error ? ('error' as const) : undefined;
});
const errorCopy = computed(() =>
  today.error === 'offline'
    ? {
        title: 'Inbox is offline',
        description: 'Your messages will load once you are back online.',
      }
    : {},
);

const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;

const mailAccounts = computed(
  () => today.payload?.accounts.filter((a) => a.capabilities.includes('mail')) ?? [],
);

const staleAccounts = computed(() => mailAccounts.value.filter((a) => a.stale));
const reconnectAccounts = computed(() =>
  mailAccounts.value.filter((a) => a.status === 'reconnect_needed' && a.reconnectUrl),
);

const hasAccounts = computed(() => mailAccounts.value.length > 0);

// FR-009: unread total across every connected mail account, including a reconnect_needed
// account's last-known count — it stays in the total but is called out as possibly stale.
// T043: filtering by account narrows the count as well as the list.
const countedAccounts = computed(() =>
  today.filterAccountId
    ? mailAccounts.value.filter((a) => a.id === today.filterAccountId)
    : mailAccounts.value,
);
const totalUnread = computed(() =>
  countedAccounts.value.reduce((sum, a) => sum + a.unreadCount, 0),
);
const hasOutOfDateUnread = computed(() =>
  countedAccounts.value.some((a) => a.status === 'reconnect_needed'),
);

const visibleMessages = computed<TodayMessageT[]>(() => today.visibleMessages);

const isEmpty = computed(() => hasAccounts.value && visibleMessages.value.length === 0);

const accountsMap = computed(() => {
  const map = new Map<string, TodayAccountT>();
  today.payload?.accounts.forEach((a) => map.set(a.id, a));
  return map;
});

function senderLabel(message: TodayMessageT): string {
  return message.fromName || message.fromAddress;
}

// FR-023: time for today, "Yesterday", then the date — the full timestamp stays available via
// title and the accessible name (see fullTimestamp below).
function formatReceivedTime(dateStr: string): string {
  const date = new Date(dateStr);
  const tdy = new Date();
  const yesterday = new Date(tdy);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === tdy.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

function fullTimestamp(dateStr: string): string {
  return formatDateTime(dateStr, locale);
}

// FR-024: every message link's accessible name includes its subject, sender, full timestamp and
// says it opens in a new tab.
function messageLinkLabel(message: TodayMessageT): string {
  const subject = message.subject || '(no subject)';
  const unreadPrefix = message.unread ? 'Unread, ' : '';
  return `${unreadPrefix}${subject}, from ${senderLabel(message)}, ${fullTimestamp(message.receivedAt)}, opens in a new tab`;
}

function truncatePreview(preview: string): string {
  return preview.length > 200 ? preview.slice(0, 200) + '...' : preview;
}

function lastRefreshedLabel(account: TodayAccountT): string {
  return account.lastRefreshAt
    ? `Last refreshed ${formatDateTime(account.lastRefreshAt, locale)}`
    : 'Last refreshed: never';
}

function onRefresh() {
  void today.refresh();
}
</script>

<template>
  <PanelFrame
    heading="Inbox"
    class="inbox-panel"
    data-panel="inbox"
    :kind="frameKind"
    :code="today.error ?? undefined"
    v-bind="errorCopy"
  >
    <div class="panel-body">
      <p v-if="!online" class="offline-note" role="status" data-testid="offline-note">
        <strong>Inbox is offline.</strong> These messages are as last loaded; Refresh is paused.
      </p>

      <template v-if="!hasAccounts">
        <div class="empty-state">
          <p>No mail accounts connected. Connect a mail account to see your recent messages.</p>
          <RouterLink :to="{ name: 'settings-connections' }" class="link">
            Connect a mail account
          </RouterLink>
        </div>
      </template>

      <template v-else>
        <div class="account-chips">
          <AccountChip v-for="account in mailAccounts" :key="account.id" :account="account" />
        </div>

        <div class="unread-summary">
          <span v-if="totalUnread > 0" class="unread-total num">{{ totalUnread }} unread</span>
          <span v-if="totalUnread > 0 && hasOutOfDateUnread" class="unread-stale-note">
            (possibly out of date)
          </span>
          <button
            type="button"
            class="refresh-button"
            :disabled="today.retryAfterSeconds !== null || !online"
            @click="onRefresh"
          >
            {{
              today.retryAfterSeconds !== null
                ? `Try again in ${today.retryAfterSeconds}s`
                : 'Refresh'
            }}
          </button>
        </div>

        <div v-if="staleAccounts.length > 0" class="stale-notices">
          <p v-for="account in staleAccounts" :key="account.id" class="stale-notice">
            {{ account.label }}: {{ lastRefreshedLabel(account) }}
          </p>
        </div>

        <div v-if="reconnectAccounts.length > 0" class="reconnect-notices">
          <p v-for="account in reconnectAccounts" :key="account.id" class="reconnect-notice">
            {{ account.label }} needs reconnecting.
            <a class="reconnect-link" :href="account.reconnectUrl">Reconnect {{ account.label }}</a>
          </p>
        </div>

        <p v-if="isEmpty" class="no-messages">No messages in your inbox</p>

        <div v-else class="messages">
          <div
            v-for="msg in visibleMessages"
            :key="msg.id"
            class="message"
            :class="{ unread: msg.unread }"
          >
            <a
              v-if="msg.link"
              class="message-link"
              :href="msg.link"
              target="_blank"
              rel="noopener"
              :aria-label="messageLinkLabel(msg)"
            >
              <div class="message-header">
                <span class="sender">{{ senderLabel(msg) }}</span>
                <span v-if="msg.unread" class="unread-marker">Unread</span>
                <time class="received-time num" :title="fullTimestamp(msg.receivedAt)">
                  {{ formatReceivedTime(msg.receivedAt) }}
                </time>
              </div>
              <div class="message-subject">{{ msg.subject || '(no subject)' }}</div>
              <div class="message-preview">{{ truncatePreview(msg.preview) }}</div>
            </a>
            <div v-else class="message-body">
              <div class="message-header">
                <span class="sender">{{ senderLabel(msg) }}</span>
                <span v-if="msg.unread" class="unread-marker">Unread</span>
                <time class="received-time num" :title="fullTimestamp(msg.receivedAt)">
                  {{ formatReceivedTime(msg.receivedAt) }}
                </time>
              </div>
              <div class="message-subject">{{ msg.subject || '(no subject)' }}</div>
              <div class="message-preview">{{ truncatePreview(msg.preview) }}</div>
            </div>
            <AccountChip
              v-if="accountsMap.get(msg.accountId)"
              :account="accountsMap.get(msg.accountId)!"
            />
          </div>
        </div>
      </template>
    </div>
  </PanelFrame>
</template>

<style scoped>
.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-fg);
  text-decoration: underline;
}
.panel-body {
  padding: var(--space-2) var(--space-4);
  min-width: 0;
}
.offline-note {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-inline-start: 4px solid var(--color-warn);
  background: var(--color-surface-raised);
  font-size: var(--text-sm);
}
.offline-note strong {
  font-weight: 600;
}
.account-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.stale-notices,
.reconnect-notices {
  margin-bottom: var(--space-3);
}
.stale-notice,
.reconnect-notice {
  margin: 0 0 var(--space-1);
  font-size: var(--text-sm);
}
.stale-notice {
  color: var(--color-fg-muted);
}
.reconnect-notice {
  border-inline-start: 4px solid var(--color-warn);
  padding-inline-start: var(--space-2);
}
.reconnect-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-inline-start: var(--space-2);
  color: var(--color-fg);
  text-decoration: underline;
}
.empty-state,
.no-events,
.no-messages {
  padding: var(--space-6) 0;
  color: var(--color-fg-muted);
}
.empty-state p {
  margin: 0 0 var(--space-2);
}
.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
@media (min-width: 1024px) {
  .link,
  .reconnect-link {
    min-height: 24px;
  }
}
.unread-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  font-size: var(--text-sm);
}
.unread-total {
  font-weight: 600;
}
.unread-stale-note {
  color: var(--color-warn);
}
.refresh-button {
  margin-inline-start: auto;
  min-height: 44px;
  padding: 0 var(--space-3);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-fg);
  cursor: pointer;
}
.refresh-button:active:not(:disabled) {
  transform: translateY(1px);
}
.refresh-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.messages {
  display: flex;
  flex-direction: column;
}
/* Unread rows carry a 4px lamp and the word "Unread"; read rows a quiet edge. */
.message {
  padding: var(--space-3) 0 var(--space-3) var(--space-3);
  border-top: 1px solid var(--color-border);
  border-inline-start: 4px solid transparent;
}
.message.unread {
  border-inline-start-color: var(--color-accent);
}
.message-link,
.message-body {
  display: block;
  color: inherit;
  text-decoration: none;
  min-height: 44px;
}
.message-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.message-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-1);
}
.sender {
  font-size: var(--text-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}
/* Label role. */
.unread-marker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.received-time {
  margin-inline-start: auto;
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  white-space: nowrap;
}
.message-subject {
  font-weight: 600;
  font-size: var(--text-sm);
  margin-bottom: var(--space-1);
}
.message-preview {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message .account-chip {
  margin-top: var(--space-2);
}
@media (min-width: 1024px) {
  .refresh-button,
  .message-link,
  .message-body {
    min-height: 24px;
  }
}
</style>
