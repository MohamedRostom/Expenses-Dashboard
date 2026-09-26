<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useTodayStore } from '../../stores/today.js';
import PanelState from '../PanelState.vue';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

const visibleMessages = computed(() => {
  if (!today.payload) return [];
  if (!today.filterAccountId) return today.payload.messages;
  return today.payload.messages.filter((m) => m.accountId === today.filterAccountId);
});

const hasAccounts = computed(
  () => today.payload?.accounts.some((a) => a.capabilities.includes('mail')) ?? false,
);

const isEmpty = computed(
  () => hasAccounts.value && (!today.payload?.messages || today.payload.messages.length === 0),
);

const unreadTotal = computed(() => {
  if (!today.payload?.messages) return 0;
  return today.payload.messages.filter((m) => m.unread).length;
});

function formatReceivedTime(dateStr: string): string {
  const date = new Date(dateStr);
  const tdy = new Date();
  const yesterday = new Date(tdy);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === tdy.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncatePreview(preview: string): string {
  return preview.length > 200 ? preview.slice(0, 200) + '...' : preview;
}
</script>

<template>
  <div class="inbox-panel">
    <h2>Inbox</h2>

    <PanelState v-if="today.loading" kind="loading" />

    <template v-else-if="!hasAccounts">
      <div class="empty-state">
        <p>No mail accounts connected. Connect a mail account to see your recent messages.</p>
        <RouterLink :to="{ name: 'settings-connections' }" class="link">
          Connect a mail account
        </RouterLink>
      </div>
    </template>

    <template v-else-if="isEmpty">
      <p class="no-messages">No messages in your inbox</p>
    </template>

    <template v-else>
      <div class="account-chips">
        <AccountChip
          v-for="account in today.payload?.accounts.filter((a) => a.capabilities.includes('mail'))"
          :key="account.id"
          :account="account"
        />
      </div>
      <div v-if="unreadTotal > 0" class="unread-badge">{{ unreadTotal }} unread</div>
      <div class="messages">
        <div v-for="message in visibleMessages" :key="message.id" class="message">
          <div class="message-header">
            <div class="sender">
              <strong>{{ message.fromName || message.fromAddress }}</strong>
              <span v-if="!message.unread" class="read-indicator">(read)</span>
            </div>
            <div class="received-time">{{ formatReceivedTime(message.receivedAt) }}</div>
          </div>
          <div class="message-subject">{{ message.subject || '(no subject)' }}</div>
          <div class="message-preview">{{ truncatePreview(message.preview) }}</div>
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

.unread-badge {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-accent);
  font-weight: 500;
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
  border-left: 3px solid var(--color-accent);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.25rem;
}

.sender {
  font-size: 0.875rem;
}

.read-indicator {
  color: var(--color-fg-secondary);
  font-weight: normal;
}

.received-time {
  font-size: 0.75rem;
  color: var(--color-fg-secondary);
  white-space: nowrap;
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
}
</style>
