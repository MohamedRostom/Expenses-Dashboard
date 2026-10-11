<script setup lang="ts">
import { PanelFrame } from '@desk/ui';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { TodayAccountT, TodayEventT } from '@desk/contracts';
import { useTodayStore } from '../../stores/today.js';
import { formatDateTime } from '../../utils/format.js';
import AccountChip from './AccountChip.vue';

const today = useTodayStore();

// Offline: the last content stays, under a note with the calendar's own words.
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
        title: 'Calendar is offline',
        description: 'Your events will load once you are back online.',
      }
    : {},
);

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
  <PanelFrame
    heading="Calendar"
    class="calendar-panel"
    data-panel="calendar"
    :kind="frameKind"
    :code="today.error ?? undefined"
    v-bind="errorCopy"
  >
    <div class="panel-body">
      <p v-if="!online" class="offline-note" role="status" data-testid="offline-note">
        <strong>Calendar is offline.</strong> These events are as last loaded.
      </p>

      <template v-if="!hasAccounts">
        <div class="empty-state">
          <p>
            No calendar accounts connected. Connect a calendar to see your next 7 days of events.
          </p>
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
            <h4 class="day-heading">{{ formatDayHeading(day.date) }}</h4>
            <div v-for="event in day.events" :key="event.id" class="event">
              <div class="event-time num">{{ timeLabel(event) }}</div>
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

.events {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
/* Label role: small spaced capitals. */
.day-heading {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.event {
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-border);
}
.event-time {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
}
.event-title {
  font-weight: 600;
  margin: var(--space-1) 0;
  overflow-wrap: anywhere;
}
.tentative-mark {
  margin-inline-start: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-warn);
}
.event-location {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
}
.event-footer {
  margin-top: var(--space-2);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.event-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: var(--text-sm);
  color: var(--color-fg);
  text-decoration: underline;
}
@media (min-width: 1024px) {
  .event-link {
    min-height: 24px;
  }
}
</style>
