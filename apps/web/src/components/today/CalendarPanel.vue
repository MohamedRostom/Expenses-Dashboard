<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { TodayAccountT, TodayEventT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';
import { formatDateTime } from '../../utils/format.js';
import PanelState from '../PanelState.vue';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;

const calendarAccounts = computed(
  () => today.payload?.accounts.filter((a) => a.capabilities.includes('calendar')) ?? [],
);

const staleAccounts = computed(() => calendarAccounts.value.filter((a) => a.stale));
const reconnectAccounts = computed(() =>
  calendarAccounts.value.filter((a) => a.status === 'reconnect_needed' && a.reconnectUrl),
);

const calendarEvents = computed(() => {
  if (!today.payload) return [];
  if (!today.filterAccountId) return today.payload.days;
  return today.payload.days.map((day) => ({
    ...day,
    events: day.events.filter((e) => e.accountId === today.filterAccountId),
  }));
});

const hasAccounts = computed(() => calendarAccounts.value.length > 0);

const isEmpty = computed(
  () => hasAccounts.value && !calendarEvents.value.some((d) => d.events.length > 0),
);

const accountsMap = computed(() => {
  const map = new Map<string, TodayAccountT>();
  today.payload?.accounts.forEach((a) => map.set(a.id, a));
  return map;
});

// FR-023: "Today", "Tomorrow", then weekday and date (e.g. "Wed 30 Sep") — day before month,
// no locale-dependent comma, so the parts are pulled apart and rejoined rather than relying on
// Intl's own ordering for this combination.
function formatDayHeading(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day);
  const tdy = new Date();
  tdy.setHours(0, 0, 0, 0);
  const tomorrow = new Date(tdy);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === tdy.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  const parts = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

// FR-023: 12- or 24-hour clock follows the viewer's locale via Intl.DateTimeFormat, not a
// hard-coded hour12 flag.
function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(dateStr),
  );
}

function timeLabel(event: TodayEventT): string {
  if (event.allDay) return 'All day';
  return `${formatTime(event.startsAt)}–${formatTime(event.endsAt)}`;
}

// FR-024: every event link's accessible name includes its title, account and time, and says it
// opens in a new tab.
function eventLinkLabel(event: TodayEventT): string {
  const account = accountsMap.value.get(event.accountId);
  return `${event.title}, ${account?.label ?? ''}, ${timeLabel(event)}, opens in a new tab`;
}

function lastRefreshedLabel(account: TodayAccountT): string {
  return account.lastRefreshAt
    ? `Last refreshed ${formatDateTime(account.lastRefreshAt, locale)}`
    : 'Last refreshed: never';
}
</script>

<template>
  <div class="calendar-panel">
    <h2>Calendar</h2>

    <PanelState v-if="today.loading || today.purged" kind="loading" />
    <PanelState v-else-if="today.error" kind="error" :code="today.error" />

    <template v-else-if="!hasAccounts">
      <div class="empty-state">
        <p>No calendar accounts connected. Connect a calendar to see your next 7 days of events.</p>
        <RouterLink :to="{ name: 'settings-connections' }" class="link">
          Connect a calendar
        </RouterLink>
      </div>
    </template>

    <template v-else>
      <div class="account-chips">
        <AccountChip v-for="account in calendarAccounts" :key="account.id" :account="account" />
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

      <p v-if="isEmpty" class="no-events">No events in the next seven days</p>

      <div v-else class="events">
        <div v-for="day in calendarEvents" :key="day.date" class="day">
          <h3 class="day-heading">{{ formatDayHeading(day.date) }}</h3>
          <div v-for="event in day.events" :key="event.id" class="event">
            <div class="event-time">{{ timeLabel(event) }}</div>
            <div class="event-title">
              {{ event.title }}
              <span v-if="event.tentative" class="tentative-mark">Tentative</span>
            </div>
            <div v-if="event.location" class="event-location">{{ event.location }}</div>
            <div class="event-footer">
              <AccountChip
                v-if="accountsMap.get(event.accountId)"
                :account="accountsMap.get(event.accountId)!"
              />
              <a
                v-if="event.link"
                class="event-link"
                :href="event.link"
                target="_blank"
                rel="noopener"
                :aria-label="eventLinkLabel(event)"
              >
                Open
              </a>
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

.tentative-mark {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-warn);
  margin-left: 0.5rem;
}

.event-location {
  font-size: 0.8rem;
  color: var(--color-fg-secondary);
}

.event-footer {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.event-link {
  font-size: 0.8rem;
  color: var(--color-accent);
}
</style>
