<script setup lang="ts">
/** T027a: the Today mock-up in the proposed identity: the widget strip above a calendar and an
 * inbox. Fixtures only: no API, no store. DOM contract: tests/e2e/tests/visual.spec.ts. Status is
 * said twice (a lamp and a word); the account chips use the account palette, never warn or critical. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { EmptyState, Skeleton, Tabs } from '@desk/ui';
import BoardHeader from './BoardHeader.vue';
import WidgetFrame from './WidgetFrame.vue';
import { useMockLive } from './useMockLive.js';
import { TODAY_STRIP, PACE, type WidgetState } from '../fixtures-widgets.js';
import {
  ARRIVAL,
  ARRIVAL_MS,
  COPY,
  DAYS,
  MESSAGES,
  acct,
  type MockMessage,
} from '../fixtures-today.js';
import './board.css';
import './widgets.css';
import './today.css';

const route = useRoute();
const state = computed<'default' | 'loading' | 'empty' | 'error'>(() => {
  const s = String(route.query['state'] ?? '');
  return s === 'loading' || s === 'empty' || s === 'error' ? s : 'default';
});
const stripState = computed<WidgetState>(() => state.value);
const live = useMockLive({ monthDays: PACE.monthDays, startDay: PACE.startDay });

// Calendar
const dayId = ref(DAYS[0]!.id);
const day = computed(() => DAYS.find((d) => d.id === dayId.value)!);
const tabs = DAYS.map((d) => ({ id: d.id, label: d.tab }));

// Inbox
const messages = ref<MockMessage[]>(MESSAGES.map((m) => ({ ...m })));
const unread = computed(() => messages.value.filter((m) => m.unread).length);
const flips = ref(0); // 0 on first render, +1 per change: the count flips once per change
let last = unread.value;
function syncCount() {
  if (unread.value !== last) {
    last = unread.value;
    flips.value++;
  }
}
function markRead(m: MockMessage) {
  m.unread = false;
  syncCount();
}

let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  if (!live.live.value) return;
  timer = setTimeout(() => {
    messages.value = [{ ...ARRIVAL }, ...messages.value];
    syncCount();
  }, ARRIVAL_MS);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div data-mockup-root>
    <div data-mockup="today">
      <BoardHeader current="month" />
      <main class="mk-main">
        <h1 class="mk-title">Today</h1>

        <section
          class="mk-panel mk-settle"
          data-mockup-panel="strip"
          aria-label="Widgets"
          style="--i: 0"
        >
          <h2 class="mk-sr">Widgets</h2>
          <div class="wg-grid">
            <WidgetFrame
              v-for="(kind, i) in TODAY_STRIP"
              :key="kind"
              :kind="kind"
              :state="stripState"
              :live="live"
              :index="i"
            />
          </div>
        </section>

        <div class="td-cols">
          <section
            class="mk-panel mk-settle td-panel"
            data-mockup-panel="calendar"
            aria-labelledby="td-cal-title"
            style="--i: 3"
          >
            <h2 id="td-cal-title" class="mk-title">{{ COPY.calendar.title }}</h2>

            <div v-if="state === 'loading'" class="td-skel" data-skeleton aria-busy="true">
              <Skeleton height="2rem" />
              <Skeleton height="3.5rem" />
              <Skeleton height="3.5rem" width="80%" />
            </div>
            <EmptyState
              v-else-if="state === 'empty'"
              :title="COPY.calendar.empty.title"
              :description="COPY.calendar.empty.hint"
            />
            <div v-else-if="state === 'error'" class="td-err">
              <p class="td-status">
                <span class="td-lamp td-lamp--warn" data-lamp="warn" aria-hidden="true"></span>
                <span class="mk-status-word">{{ COPY.calendar.error.reconnect.text }}</span>
              </p>
              <p class="mk-note">{{ COPY.calendar.error.reconnect.hint }}</p>
            </div>
            <Tabs v-else v-model="dayId" :tabs="tabs" label="Day">
              <TransitionGroup :key="day.id" name="mk-list" tag="ul" class="td-list">
                <li v-for="e in day.events" :key="e.id" class="td-event">
                  <span class="mk-figure mk-num td-time">{{ e.time }}</span>
                  <span class="td-body">
                    <span class="td-title">{{ e.title }}</span>
                    <span class="mk-note">{{ e.where }}</span>
                  </span>
                  <span class="td-chip" :style="{ '--acct': acct(e.accountId).colour }">{{
                    acct(e.accountId).label
                  }}</span>
                </li>
                <li v-if="!day.events.length" key="none" class="mk-note td-none">
                  {{ COPY.calendar.noEvents }}
                </li>
              </TransitionGroup>
            </Tabs>
          </section>

          <section
            class="mk-panel mk-settle td-panel"
            data-mockup-panel="inbox"
            aria-labelledby="td-inbox-title"
            style="--i: 4"
          >
            <div class="mk-panel-head">
              <h2 id="td-inbox-title" class="mk-title">{{ COPY.inbox.title }}</h2>
              <p v-if="state === 'default'" class="mk-note">
                <span
                  :key="flips"
                  class="mk-figure mk-num"
                  :class="{ 'mk-flip': flips > 0 }"
                  data-testid="unread-count"
                  >{{ unread }} unread</span
                >
              </p>
            </div>

            <div v-if="state === 'loading'" class="td-skel" data-skeleton aria-busy="true">
              <Skeleton height="4rem" />
              <Skeleton height="4rem" />
              <Skeleton height="4rem" width="85%" />
            </div>
            <EmptyState
              v-else-if="state === 'empty'"
              :title="COPY.inbox.empty.title"
              :description="COPY.inbox.empty.hint"
            />
            <div v-else-if="state === 'error'" class="td-err">
              <p class="td-status">
                <span class="td-lamp td-lamp--warn" data-lamp="warn" aria-hidden="true"></span>
                <span class="mk-status-word">{{ COPY.inbox.error.rate.text }}</span>
              </p>
              <p class="mk-note">{{ COPY.inbox.error.rate.hint }}</p>
            </div>
            <TransitionGroup v-else name="mk-list" tag="ul" class="td-list">
              <li
                v-for="m in messages"
                :key="m.id"
                class="td-msg"
                :data-message="m.id"
                :data-unread="m.unread"
              >
                <span
                  class="td-lamp"
                  :class="m.unread ? 'td-lamp--unread' : 'td-lamp--read'"
                  :data-lamp="m.unread ? 'unread' : 'read'"
                  aria-hidden="true"
                ></span>
                <span class="td-body">
                  <span class="td-head">
                    <span class="td-title">{{ m.from }}</span>
                    <span class="mk-status-word td-word">{{ m.unread ? 'Unread' : 'Read' }}</span>
                    <time class="mk-note mk-num td-when">{{ m.time }}</time>
                  </span>
                  <span class="td-subject">{{ m.subject }}</span>
                  <span class="mk-note td-preview">{{ m.preview }}</span>
                  <span class="td-foot">
                    <span class="td-chip" :style="{ '--acct': acct(m.accountId).colour }">{{
                      acct(m.accountId).label
                    }}</span>
                    <button
                      v-if="m.unread"
                      type="button"
                      class="td-mark"
                      :aria-label="`Mark ${m.subject} as read`"
                      @click="markRead(m)"
                    >
                      Mark read
                    </button>
                  </span>
                </span>
              </li>
            </TransitionGroup>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
