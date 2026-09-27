<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { TodayAccountT, TodayMessageT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';
import { formatDateTime } from '../../utils/format.js';
import PanelState from '../PanelState.vue';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

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
const totalUnread = computed(() => mailAccounts.value.reduce((sum, a) => sum + a.unreadCount, 0));
const hasOutOfDateUnread = computed(() =>
  mailAccounts.value.some((a) => a.status === 'reconnect_needed'),
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
  <div class="inbox-panel">
    <h2>Inbox</h2>

    <PanelState v-if="today.loading" kind="loading" />
    <PanelState v-else-if="today.error" kind="error" :code="today.error" />

    <template v-else-if="!hasAccounts">
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
        <span v-if="totalUnread > 0" class="unread-total">{{ totalUnread }} unread</span>
        <span v-if="totalUnread > 0 && hasOutOfDateUnread" class="unread-stale-note">
          (possibly out of date)
        </span>
        <button
          type="button"
          class="refresh-button"
          :disabled="today.retryAfterSeconds !== null"
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
              <time class="received-time" :title="fullTimestamp(msg.receivedAt)">
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
              <time class="received-time" :title="fullTimestamp(msg.receivedAt)">
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
</template>

<style scoped>
.inbox-panel {
  padding: 1rem;
}

h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--color-fg-secondary);
}

.empty-state p {
  margin-bottom: 1rem;
}

.link {
  color: var(--color-accent);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.no-messages {
  text-align: center;
  padding: 2rem;
  color: var(--color-fg-secondary);
}

.account-chips {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.unread-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.unread-total {
  color: var(--color-accent);
  font-weight: 500;
}

.unread-stale-note {
  color: var(--color-warn);
  font-size: 0.8rem;
}

.refresh-button {
  margin-left: auto;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-fg);
  cursor: pointer;
}

.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.stale-notices,
.reconnect-notices {
  margin-bottom: 1rem;
}

.stale-notice {
  font-size: 0.8rem;
  color: var(--color-fg-secondary);
  margin: 0 0 0.25rem 0;
}

.reconnect-notice {
  font-size: 0.85rem;
  color: var(--color-warn);
  margin: 0 0 0.25rem 0;
}

.reconnect-link {
  color: var(--color-accent);
  margin-left: 0.5rem;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: var(--color-bg-secondary);
  border-left: 3px solid var(--color-border);
}

.message.unread {
  border-left-color: var(--color-accent);
}

.message-link,
.message-body {
  display: block;
  color: inherit;
  text-decoration: none;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.sender {
  font-size: 0.875rem;
  font-weight: 600;
}

.unread-marker {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
}

.received-time {
  font-size: 0.75rem;
  color: var(--color-fg-secondary);
  white-space: nowrap;
  margin-left: auto;
}

.message-subject {
  font-weight: 500;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.message-preview {
  font-size: 0.875rem;
  color: var(--color-fg-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message .account-chip {
  margin-top: 0.5rem;
}
</style>
