<script setup lang="ts">
/** T027 / FR-004: settings in the proposed identity. Same sections, order and controls as
 * views/SettingsView.vue (FR-010). Static; no store, no API. Query: `?state=loading|empty|error`
 * (`empty` is a new, unverified account). DOM contract: tests/e2e/tests/visual.spec.ts. */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button, ErrorState, Input, Select, Skeleton, ThemeToggle } from '@desk/ui';
import '../proposed-tokens.css';
import './board.css';
import BoardHeader from './BoardHeader.vue';
import { user } from '../fixtures.js';

const route = useRoute();
const state = computed(() => String(route.query['state'] ?? 'default'));
const isNew = computed(() => state.value === 'empty');

const sections = [
  { id: 'profile', title: 'Profile' },
  { id: 'currency', title: 'Default currency' },
  { id: 'theme', title: 'Theme' },
  { id: 'timezone', title: 'Time zone' },
  { id: 'widgets', title: 'Widgets' },
  { id: 'sessions', title: 'Sessions' },
  { id: 'capture', title: 'Phone capture' },
  { id: 'export', title: 'Export' },
  { id: 'delete', title: 'Delete account' },
];

const newEmail = ref('');
const password = ref('');
const currency = ref<string>(user.default_currency);
const theme = ref<string>(user.theme);
const timeZone = ref(state.value === 'error' ? 'London' : user.time_zone);
const unit = ref<'C' | 'F'>('C');
const currencyOptions = ['GBP', 'EUR', 'USD'].map((c) => ({ value: c, label: c }));

const places = computed(() => (isNew.value ? [] : ['London, England', 'Lisbon, Portugal']));
const sessions = computed(() => [
  { id: 's1', device: 'Edge on Windows', seen: '05 Oct 2026, 09:12', current: true },
  ...(isNew.value
    ? []
    : [
        { id: 's2', device: 'Safari on iPhone', seen: '04 Oct 2026, 18:40', current: false },
        { id: 's3', device: 'Firefox on Linux', seen: '21 Sep 2026, 07:03', current: false },
      ]),
]);
</script>

<template>
  <div data-identity="proposed">
    <div data-mockup="settings">
      <BoardHeader current="settings" show-month />
      <main class="mk-main st">
        <h1 class="st-title">Settings</h1>

        <nav class="st-index" aria-label="Settings sections">
          <a v-for="s in sections" :key="s.id" :href="`#st-${s.id}`" class="st-index-link">{{
            s.title
          }}</a>
        </nav>

        <div class="st-sections">
          <section
            id="st-profile"
            class="mk-flap st-section"
            data-mockup-panel="profile"
            aria-labelledby="st-profile-h"
          >
            <h2 id="st-profile-h" class="mk-title">Profile</h2>
            <Skeleton v-if="state === 'loading'" height="1.5rem" width="16rem" />
            <p v-else class="st-row">
              <span class="mk-label">Email</span>
              <span class="st-value">you@example.com</span>
              <span v-if="isNew" class="st-status mk-warn">Unverified</span>
            </p>
            <div v-if="isNew" class="st-note">
              <span class="mk-lamp mk-lamp--warn" />
              <div class="st-note-body">
                <p>
                  Confirm your address within 7 days of signing up, or sign-in is paused until you
                  do.
                </p>
                <Button variant="secondary">Resend verification email</Button>
              </div>
            </div>
            <form class="st-form" @submit.prevent>
              <Input
                v-model="newEmail"
                type="email"
                label="New email"
                placeholder="new@example.com"
              />
              <Input v-model="password" type="password" label="Current password (if set)" />
              <div><Button type="submit">Change email</Button></div>
            </form>
          </section>

          <section
            id="st-currency"
            class="mk-flap st-section"
            data-mockup-panel="currency"
            aria-labelledby="st-currency-h"
          >
            <h2 id="st-currency-h" class="mk-title">Default currency</h2>
            <p class="st-help">
              Every expense is also shown in this currency. Changing it re-derives every row at the
              rate of its own date.
            </p>
            <Skeleton v-if="state === 'loading'" height="2.75rem" width="10rem" />
            <div v-else class="st-narrow">
              <Select v-model="currency" label="Default currency" :options="currencyOptions" />
            </div>
          </section>

          <section
            id="st-theme"
            class="mk-flap st-section"
            data-mockup-panel="theme"
            aria-labelledby="st-theme-h"
          >
            <h2 id="st-theme-h" class="mk-title">Theme</h2>
            <ThemeToggle v-model="theme" label="Theme" />
          </section>

          <section
            id="st-timezone"
            class="mk-flap st-section"
            data-mockup-panel="timezone"
            aria-labelledby="st-timezone-h"
          >
            <h2 id="st-timezone-h" class="mk-title">Time zone</h2>
            <p class="st-help">
              Used to date captures sent from your phone, for example from iOS Shortcuts.
            </p>
            <form class="st-form st-inline" @submit.prevent>
              <Input
                v-model="timeZone"
                label="IANA time zone"
                placeholder="Europe/London"
                :error="
                  state === 'error'
                    ? 'Desk doesn\'t know that zone. Use a name like Europe/London.'
                    : ''
                "
              />
              <div><Button type="submit">Save time zone</Button></div>
            </form>
          </section>

          <section
            id="st-widgets"
            class="mk-flap st-section"
            data-mockup-panel="widgets"
            aria-labelledby="st-widgets-h"
          >
            <h2 id="st-widgets-h" class="mk-title">Widgets</h2>
            <p v-if="places.length === 0" class="st-help">No places in use by your widgets.</p>
            <template v-else>
              <p class="st-help">Places used by your widgets:</p>
              <ul class="st-list">
                <li v-for="p in places" :key="p">{{ p }}</li>
              </ul>
            </template>
            <fieldset class="st-fieldset">
              <legend class="mk-label">Temperature unit</legend>
              <label v-for="u in ['C', 'F'] as const" :key="u" class="st-radio">
                <input v-model="unit" type="radio" name="st-unit" :value="u" />
                <span class="mk-num">°{{ u }}</span>
              </label>
            </fieldset>
          </section>

          <section
            id="st-sessions"
            class="mk-flap st-section"
            data-mockup-panel="sessions"
            aria-labelledby="st-sessions-h"
          >
            <h2 id="st-sessions-h" class="mk-title">Sessions</h2>
            <div v-if="state === 'loading'" class="st-skeleton" aria-busy="true">
              <span class="mk-sr">Loading sessions</span>
              <Skeleton v-for="i in 3" :key="i" height="1.25rem" />
            </div>
            <ErrorState
              v-else-if="state === 'error'"
              title="Couldn't load your sessions"
              description="The server didn't answer. Your other settings are unaffected."
            >
              <template #action><Button variant="secondary">Try again</Button></template>
            </ErrorState>
            <table v-else class="mk-board st-sessions">
              <caption class="mk-sr">
                Signed-in sessions
              </caption>
              <thead>
                <tr>
                  <th class="mk-label" scope="col">Device</th>
                  <th class="mk-label st-col-seen" scope="col">Last seen</th>
                  <th class="st-col-action" scope="col"><span class="mk-sr">Action</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in sessions" :key="s.id">
                  <td>
                    <span class="mk-item">
                      <span class="mk-item-name">{{ s.device }}</span>
                      <span class="st-seen-inline mk-fig-small">{{ s.seen }}</span>
                    </span>
                  </td>
                  <td class="st-col-seen mk-num">{{ s.seen }}</td>
                  <td class="st-col-action">
                    <span v-if="s.current" class="st-current">This session</span>
                    <Button v-else variant="ghost" size="sm">Revoke</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section
            id="st-capture"
            class="mk-flap st-section"
            data-mockup-panel="capture"
            aria-labelledby="st-capture-h"
          >
            <h2 id="st-capture-h" class="mk-title">Phone capture</h2>
            <p class="st-help">
              Send expenses from your phone (iOS Shortcuts, MacroDroid) without opening the app.
            </p>
            <div><Button variant="secondary">Manage capture address</Button></div>
          </section>

          <section
            id="st-export"
            class="mk-flap st-section"
            data-mockup-panel="export"
            aria-labelledby="st-export-h"
          >
            <h2 id="st-export-h" class="mk-title">Export</h2>
            <div><Button variant="secondary">Download my data</Button></div>
          </section>

          <section
            id="st-delete"
            class="mk-flap st-section"
            data-mockup-panel="delete"
            aria-labelledby="st-delete-h"
          >
            <h2 id="st-delete-h" class="mk-title">Delete account</h2>
            <p class="st-help">
              Permanently deletes your account, expenses, categories and Notion connection.
            </p>
            <div><Button variant="danger">Delete account</Button></div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.st {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.st-title {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
/* Below 1024 the section index is a scrolling row of links, so a phone can jump to any section. */
.st-index {
  display: flex;
  gap: var(--space-4);
  margin-inline: calc(-1 * var(--gutter));
  padding-inline: var(--gutter);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--gutter);
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-border);
}
.st-index-link {
  display: flex;
  align-items: center;
  flex: none;
  min-height: var(--target-min);
  scroll-snap-align: start;
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  transition: color var(--motion-fast) var(--ease-standard);
}
.st-index-link:hover {
  color: var(--color-fg);
}
.st-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.st-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  scroll-margin-top: var(--space-4);
}
.st-section p {
  margin: 0;
}
.st-section > .desk-theme {
  align-self: flex-start;
}
.st-help {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  max-width: 60ch;
}
.st-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
}
.st-value {
  overflow-wrap: anywhere;
}
.st-status {
  font-size: var(--text-sm);
  font-weight: 600;
}
.st-note {
  display: grid;
  grid-template-columns: var(--space-1) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.st-note-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}
.st-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 28rem;
}
.st-narrow {
  max-width: 12rem;
}
.st-list {
  margin: 0;
  padding-left: var(--space-5);
}
.st-fieldset {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
}
.st-fieldset legend {
  float: left;
  margin-right: var(--space-2);
}
.st-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  cursor: pointer;
}
.st-radio input {
  width: var(--space-5);
  height: var(--space-5);
  margin: 0;
}
.st-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.st-sessions th,
.st-sessions td {
  padding-inline: 0 var(--space-3);
}
.st-col-seen {
  display: none;
}
.st-col-action {
  width: 7.5rem;
  text-align: right;
}
.st-sessions td.st-col-action {
  padding-right: 0;
}
.st-current {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
}
.st-seen-inline {
  white-space: nowrap;
}
@media (min-width: 768px) {
  .st-col-seen {
    display: table-cell;
    width: 12rem;
    font-size: var(--text-sm);
    color: var(--color-fg-muted);
  }
  .st-seen-inline {
    display: none;
  }
  .st-inline {
    flex-direction: row;
    align-items: flex-start;
    max-width: none;
  }
  .st-inline > :first-child {
    flex: 0 1 20rem;
  }
  .st-inline > :last-child {
    padding-top: var(--space-6);
  }
}
@media (min-width: 1024px) {
  .st {
    grid-template-columns: 12rem minmax(0, 46rem);
    grid-template-areas:
      'title title'
      'index sections';
    column-gap: var(--space-10);
    justify-content: start;
  }
  .st-title {
    grid-area: title;
  }
  .st-index {
    grid-area: index;
    display: flex;
    flex-direction: column;
    align-self: start;
    gap: 0;
    margin-inline: 0;
    padding-inline: 0;
    overflow: visible;
    position: sticky;
    top: var(--space-4);
    border-bottom: 0;
    border-left: 1px solid var(--color-border);
  }
  .st-index-link {
    min-height: var(--space-8);
    padding-left: var(--space-3);
  }
  .st-sections {
    grid-area: sections;
  }
}
</style>
