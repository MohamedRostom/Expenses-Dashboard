<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useTodayStore } from '../../stores/today.js';
import PanelState from '../PanelState.vue';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

const calendarEvents = computed(() => {
  if (!today.payload) return [];
  if (!today.filterAccountId) return today.payload.days;
  return today.payload.days.map((day) => ({
    ...day,
    events: day.events.filter((e) => e.accountId === today.filterAccountId),
  }));
});

const hasAccounts = computed(
  () => today.payload?.accounts.some((a) => a.capabilities.includes('calendar')) ?? false,
);

const isEmpty = computed(() => {
  const accounts = today.payload?.accounts.filter((a) => a.capabilities.includes('calendar'));
  return (
    (hasAccounts.value &&
      accounts?.every(
        (a) => !today.payload?.days.some((d) => d.events.some((e) => e.accountId === a.id)),
      )) ??
    false
  );
});

const accountsMap = computed(() => {
  const map = new Map<string, NonNullable<typeof today.payload>['accounts'][number]>();
  today.payload?.accounts.forEach((a) => map.set(a.id, a));
  return map;
});

function formatDayHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const tdy = new Date();
  const tomorrow = new Date(tdy);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === tdy.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
</script>

<template>
  <div class="calendar-panel">
    <h2>Calendar</h2>

    <PanelState v-if="today.loading" kind="loading" />

    <template v-else-if="!hasAccounts">
      <div class="empty-state">
        <p>No calendar accounts connected. Connect a calendar to see your next 7 days of events.</p>
        <RouterLink :to="{ name: 'settings-connections' }" class="link">
          Connect a calendar
        </RouterLink>
      </div>
    </template>

    <template v-else-if="isEmpty">
      <p class="no-events">No events in the next seven days</p>
    </template>

    <template v-else>
      <div class="account-chips">
        <AccountChip
          v-for="account in today.payload?.accounts.filter((a) =>
            a.capabilities.includes('calendar'),
          )"
          :key="account.id"
          :account="account"
        />
      </div>
      <div class="events">
        <div v-for="day in calendarEvents" :key="day.date" class="day">
          <h3 class="day-heading">{{ formatDayHeading(day.date) }}</h3>
          <div v-for="event in day.events" :key="event.id" class="event">
            <div class="event-time">
              {{ event.allDay ? 'All day' : formatTime(event.startsAt) }}
            </div>
            <div class="event-title">{{ event.title }}</div>
            <div v-if="accountsMap.get(event.accountId)" class="event-account">
              <AccountChip
                v-if="accountsMap.get(event.accountId)"
                :account="accountsMap.get(event.accountId)!"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calendar-panel {
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

.no-events {
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

.events {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.day {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}

.day-heading {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-fg-secondary);
}

.event {
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: var(--color-bg-secondary);
  margin-bottom: 0.5rem;
}

.event-time {
  font-size: 0.75rem;
  color: var(--color-fg-secondary);
}

.event-title {
  font-weight: 500;
  margin: 0.25rem 0;
}

.event-account {
  margin-top: 0.5rem;
}
</style>
