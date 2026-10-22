<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Button,
  DataTable,
  Dialog,
  ErrorState,
  Input,
  PanelFrame,
  Skeleton,
  ThemeToggle,
  useToast,
} from '@desk/ui';
import type { BoardColumn } from '@desk/ui';
import { ACCENT_IDS } from '@desk/contracts';
import type {
  AccentId,
  JobResponseT,
  PatchMeResponseT,
  SessionSummaryT,
  TemperatureUnitT,
} from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';
import { describeDevice, formatSeen } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';
import { useFlagsStore } from '../stores/flags.js';
import { useWidgetsStore } from '../stores/widgets.js';
import CurrencyPicker from '../components/CurrencyPicker.vue';
import AppearanceSettings from '../components/appearance/AppearanceSettings.vue';
import { applyAccent, applyTheme } from './theme.js';

const session = useSessionStore();
const router = useRouter();
const toast = useToast();

const newEmail = ref('');
const emailChangePassword = ref('');
const emailNotice = ref('');
const emailSubmitting = ref(false);
const emailError = ref('');
const verifyNotice = ref('');
const verifySending = ref(false);

const currency = ref(session.user?.defaultCurrency ?? '');
const currencySubmitting = ref(false);
const job = ref<JobResponseT | null>(null);
let jobTimer: ReturnType<typeof setTimeout> | undefined;

// The index mirrors the grouped panels below; keep the two in the same order.
const ALL_GROUPS = [
  {
    id: 'account',
    title: 'Account',
    sections: [
      { id: 'profile', title: 'Profile' },
      { id: 'sessions', title: 'Sessions' },
    ],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    sections: [
      { id: 'currency', title: 'Default currency' },
      { id: 'timezone', title: 'Time zone' },
      { id: 'widgets', title: 'Widgets' },
    ],
  },
  {
    id: 'look',
    title: 'Look and feel',
    sections: [
      { id: 'theme', title: 'Theme' },
      { id: 'appearance', title: 'Appearance' },
    ],
  },
  {
    id: 'data',
    title: 'Your data',
    sections: [
      { id: 'capture', title: 'Phone capture' },
      { id: 'export', title: 'Export' },
      { id: 'delete', title: 'Delete account' },
    ],
  },
];
// Appearance (spec 006) exists only while the flag is on, in the index and as a panel.
const GROUPS = computed(() =>
  ALL_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => s.id !== 'appearance' || flags.isOn('appearance.motion')),
  })),
);
const sessionColumns: BoardColumn[] = [
  { key: 'device', label: 'Device' },
  { key: 'actions', label: 'Actions', srOnly: true, width: 'action' },
];
const theme = ref<string>(session.user?.theme ?? 'system');
const themeSubmitting = ref(false);

// US5 (FR-019): the accent picker shows only with `appearance.accent`.
const flags = useFlagsStore();
const ACCENT_NAMES: Record<AccentId, string> = {
  'signal-green': 'Signal Green',
  'concourse-blue': 'Concourse Blue',
  'platform-teal': 'Platform Teal',
  violet: 'Violet',
  slate: 'Slate',
  plum: 'Plum',
};
const accent = ref<AccentId>(session.user?.accent ?? 'signal-green');
// Each swatch resolves its own preset colour from tokens.css, which needs a concrete theme.
const swatchTheme = computed(() =>
  theme.value === 'system'
    ? typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : theme.value,
);

const timeZone = ref<string>(
  session.user?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
);
const timeZoneSubmitting = ref(false);

const sessions = ref<SessionSummaryT[]>([]);
const sessionsLoading = ref(true);
const sessionsError = ref('');

const deleteOpen = ref(false);
const deleteConfirmText = ref('');
const deletePassword = ref('');
const deleteSubmitting = ref(false);
const deleteError = ref('');

async function loadSessions() {
  sessionsLoading.value = true;
  sessionsError.value = '';
  try {
    const res = await apiFetch<{ sessions: SessionSummaryT[] }>('/me/sessions');
    sessions.value = res.sessions;
  } catch (err) {
    sessionsError.value = err instanceof ApiError ? err.message : 'Failed to load sessions.';
  } finally {
    sessionsLoading.value = false;
  }
}

const widgetsStore = useWidgetsStore();
const widgetPlaces = computed(() => {
  const seen = new Map<string, string>();
  for (const w of widgetsStore.widgets) {
    if (w.place) seen.set(`${w.place.lat},${w.place.lon}`, w.place.name);
  }
  return [...seen.values()];
});

async function changeUnit(unit: TemperatureUnitT) {
  try {
    await widgetsStore.setTemperatureUnit(unit);
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}

onMounted(() => {
  void loadSessions();
  widgetsStore.load().catch(() => {});
});
onBeforeUnmount(() => {
  if (jobTimer) clearTimeout(jobTimer);
});

// FR-001: unverified accounts can use the app for 7 days; this is their way to get a fresh link
// (e.g. when the sign-up mail never arrived). The endpoint is enumeration-safe and always 202s.
async function resendVerification() {
  if (!session.user) return;
  verifySending.value = true;
  try {
    await apiFetch<void>('/auth/verify/resend', {
      method: 'POST',
      body: JSON.stringify({ email: session.user.email }),
    });
    verifyNotice.value = 'Verification email sent — check your inbox.';
  } catch (err) {
    verifyNotice.value = err instanceof ApiError ? err.message : 'Could not send it, try again.';
  } finally {
    verifySending.value = false;
  }
}

async function changeEmail() {
  emailError.value = '';
  emailNotice.value = '';
  emailSubmitting.value = true;
  try {
    await apiFetch<void>('/me/email', {
      method: 'POST',
      body: JSON.stringify({
        newEmail: newEmail.value,
        password: emailChangePassword.value || undefined,
      }),
    });
    emailNotice.value = 'Check your new address to confirm the change.';
    newEmail.value = '';
    emailChangePassword.value = '';
  } catch (err) {
    emailError.value = err instanceof ApiError ? err.message : 'Something went wrong.';
  } finally {
    emailSubmitting.value = false;
  }
}

function pollJob(id: string) {
  apiFetch<JobResponseT>(`/jobs/${id}`)
    .then((res) => {
      job.value = res;
      if (res.status === 'done' || res.status === 'failed') {
        currencySubmitting.value = false;
        toast.push(
          res.status === 'done' ? 'Currency updated.' : 'Currency update failed.',
          res.status === 'done' ? 'info' : 'critical',
        );
        return;
      }
      jobTimer = setTimeout(() => pollJob(id), 1500);
    })
    .catch(() => {
      currencySubmitting.value = false;
    });
}

async function changeCurrency(value: string) {
  currency.value = value;
  currencySubmitting.value = true;
  job.value = null;
  try {
    const res = await apiFetch<PatchMeResponseT>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ defaultCurrency: value }),
    });
    if (res.user) session.user = res.user as typeof session.user;
    if (res.job) {
      // ponytail: no server-side "budgets need review" flag exists yet — a session-storage
      // marker is enough to show CategoriesView's review banner after a currency change.
      try {
        sessionStorage.setItem('desk_currency_changed_at', new Date().toISOString());
      } catch {
        // storage unavailable (private mode etc.) — banner simply won't show, not fatal
      }
      pollJob(res.job.id);
    } else {
      currencySubmitting.value = false;
      toast.push('Currency updated.');
    }
  } catch (err) {
    currencySubmitting.value = false;
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}

async function changeTheme(value: string) {
  theme.value = value;
  applyTheme(value);
  themeSubmitting.value = true;
  try {
    const res = await apiFetch<PatchMeResponseT>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ theme: value }),
    });
    if (res.user) session.user = res.user as typeof session.user;
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  } finally {
    themeSubmitting.value = false;
  }
}

// Optimistic: apply at once, put the old accent back if the save fails.
async function changeAccent(value: AccentId) {
  const previous = accent.value;
  accent.value = value;
  applyAccent(value, true);
  try {
    const res = await apiFetch<PatchMeResponseT>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ accent: value }),
    });
    if (res.user) session.user = res.user as typeof session.user;
  } catch (err) {
    accent.value = previous;
    applyAccent(previous, true);
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}

async function changeTimeZone() {
  timeZoneSubmitting.value = true;
  try {
    const res = await apiFetch<PatchMeResponseT>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ timeZone: timeZone.value }),
    });
    if (res.user) session.user = res.user as typeof session.user;
    toast.push('Time zone updated.');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  } finally {
    timeZoneSubmitting.value = false;
  }
}

async function revokeSession(id: string) {
  try {
    await apiFetch<void>(`/me/sessions/${id}`, { method: 'DELETE' });
    sessions.value = sessions.value.filter((s) => s.id !== id);
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to revoke session.', 'critical');
  }
}

async function downloadExport() {
  try {
    const res = await fetch('/me/export', { credentials: 'include' });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'desk-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.push('Failed to download export.', 'critical');
  }
}

async function confirmDelete() {
  deleteError.value = '';
  if (deleteConfirmText.value !== 'DELETE') {
    deleteError.value = 'Type DELETE to confirm.';
    return;
  }
  deleteSubmitting.value = true;
  try {
    await apiFetch<void>('/me', {
      method: 'DELETE',
      body: JSON.stringify({ password: deletePassword.value || undefined }),
    });
    session.user = null;
    deleteOpen.value = false;
    await router.push('/login');
  } catch (err) {
    deleteError.value = err instanceof ApiError ? err.message : 'Failed to delete account.';
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <main class="desk-settings-view">
    <h1 class="desk-settings-title">Settings</h1>

    <nav class="desk-settings-index" aria-label="Settings sections">
      <div v-for="g in GROUPS" :key="g.id" class="desk-settings-index-group">
        <a :href="`#sg-${g.id}`" class="desk-settings-index-heading">{{ g.title }}</a>
        <a
          v-for="s in g.sections"
          :key="s.id"
          :href="`#st-${s.id}`"
          class="desk-settings-index-link"
          >{{ s.title }}</a
        >
      </div>
    </nav>

    <div class="desk-settings-sections">
      <section id="sg-account" class="desk-settings-group" aria-labelledby="sg-account-h">
        <h2 id="sg-account-h" class="desk-settings-group-title">Account</h2>
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame id="st-profile" heading="Profile" class="desk-settings-section">
            <div class="desk-settings-body">
              <p class="desk-settings-row">
                <span class="desk-settings-label">Email</span>
                <span class="desk-settings-value">{{ session.user?.email }}</span>
                <span v-if="session.user?.emailVerified === false" class="desk-settings-status"
                  >Unverified</span
                >
              </p>
              <div v-if="session.user?.emailVerified === false" class="desk-settings-note">
                <p>
                  Confirm your address within 7 days of signing up, or sign-in is paused until you
                  do.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  :loading="verifySending"
                  :disabled="verifySending"
                  @click="resendVerification"
                >
                  Resend verification email
                </Button>
                <p v-if="verifyNotice" role="status">{{ verifyNotice }}</p>
              </div>
              <form class="desk-settings-form" @submit.prevent="changeEmail">
                <Input
                  v-model="newEmail"
                  type="email"
                  label="New email"
                  placeholder="new@example.com"
                />
                <Input
                  v-model="emailChangePassword"
                  type="password"
                  label="Current password (if set)"
                />
                <p v-if="emailNotice" role="status">{{ emailNotice }}</p>
                <p v-if="emailError" role="alert" class="desk-settings-error">{{ emailError }}</p>
                <div>
                  <Button type="submit" :loading="emailSubmitting" :disabled="emailSubmitting">
                    Change email
                  </Button>
                </div>
              </form>
            </div>
          </PanelFrame>

          <PanelFrame id="st-sessions" heading="Sessions" class="desk-settings-section">
            <div v-if="sessionsLoading" class="desk-settings-skeleton" aria-busy="true">
              <p class="desk-sr-only">Loading sessions…</p>
              <Skeleton v-for="i in 3" :key="i" height="1.25rem" />
            </div>
            <ErrorState
              v-else-if="sessionsError"
              title="Couldn't load your sessions"
              :description="sessionsError"
            >
              <template #action
                ><Button variant="secondary" @click="loadSessions">Try again</Button></template
              >
            </ErrorState>
            <DataTable
              v-else
              class="desk-sessions-table"
              :columns="sessionColumns"
              dense
              caption="Signed-in sessions"
            >
              <tr v-for="s in sessions" :key="s.id">
                <td>
                  <span class="desk-item">
                    <span class="desk-item-name">{{ describeDevice(s.userAgent) }}</span>
                    <span class="desk-item-cat desk-settings-seen-inline"
                      >Last seen {{ formatSeen(s.lastSeenAt) }}</span
                    >
                  </span>
                </td>
                <td class="desk-col--action">
                  <span v-if="s.current" class="desk-settings-current">This session</span>
                  <Button v-else variant="ghost" size="sm" @click="revokeSession(s.id)">
                    Revoke
                  </Button>
                </td>
              </tr>
            </DataTable>
          </PanelFrame>
        </div>
      </section>

      <section id="sg-preferences" class="desk-settings-group" aria-labelledby="sg-preferences-h">
        <h2 id="sg-preferences-h" class="desk-settings-group-title">Preferences</h2>
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame id="st-currency" heading="Default currency" class="desk-settings-section">
            <div class="desk-settings-body">
              <CurrencyPicker
                class="desk-settings-currency"
                :model-value="currency"
                label="Default currency"
                @update:model-value="changeCurrency"
              />
              <p v-if="currencySubmitting && !job">Updating…</p>
              <p
                v-if="job && job.status !== 'done' && job.status !== 'failed'"
                class="desk-settings-fig"
              >
                Re-deriving expenses: {{ job.progressDone
                }}<span v-if="job.progressTotal !== null"> / {{ job.progressTotal }}</span>
              </p>
            </div>
          </PanelFrame>

          <PanelFrame id="st-timezone" heading="Time zone" class="desk-settings-section">
            <div class="desk-settings-body">
              <p class="desk-settings-help">
                Used to default the date on captures sent from your phone (e.g. iOS Shortcuts).
              </p>
              <form class="desk-settings-form" @submit.prevent="changeTimeZone">
                <Input v-model="timeZone" label="IANA time zone" placeholder="Europe/London" />
                <div>
                  <Button
                    type="submit"
                    :loading="timeZoneSubmitting"
                    :disabled="timeZoneSubmitting"
                  >
                    Save time zone
                  </Button>
                </div>
              </form>
            </div>
          </PanelFrame>

          <PanelFrame id="st-widgets" heading="Widgets" class="desk-settings-section">
            <div class="desk-settings-body">
              <p v-if="widgetPlaces.length === 0" class="desk-settings-help">
                No places in use by your widgets.
              </p>
              <template v-else>
                <p class="desk-settings-help">Places used by your widgets:</p>
                <ul class="desk-settings-list">
                  <li v-for="p in widgetPlaces" :key="p" data-testid="widget-place">{{ p }}</li>
                </ul>
              </template>
              <fieldset class="desk-settings-fieldset">
                <legend class="desk-settings-label">Temperature unit</legend>
                <label v-for="u in ['C', 'F'] as const" :key="u" class="desk-settings-radio">
                  <input
                    type="radio"
                    name="settings-temperature-unit"
                    :value="u"
                    :checked="widgetsStore.temperatureUnit === u"
                    @change="changeUnit(u)"
                  />
                  <span class="desk-settings-fig">°{{ u }}</span>
                </label>
              </fieldset>
            </div>
          </PanelFrame>
        </div>
      </section>

      <section id="sg-look" class="desk-settings-group" aria-labelledby="sg-look-h">
        <h2 id="sg-look-h" class="desk-settings-group-title">Look and feel</h2>
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame id="st-theme" heading="Theme" class="desk-settings-section">
            <div class="desk-settings-body desk-settings-body--start">
              <ThemeToggle v-model="theme" label="Theme" @update:model-value="changeTheme" />
              <fieldset
                v-if="flags.isOn('appearance.accent')"
                class="desk-settings-accents"
                role="radiogroup"
              >
                <legend class="desk-settings-label">Accent colour</legend>
                <label
                  v-for="id in ACCENT_IDS"
                  :key="id"
                  class="desk-settings-accent"
                  :data-accent="id"
                  :data-theme="swatchTheme"
                >
                  <input
                    :checked="accent === id"
                    type="radio"
                    name="settings-accent"
                    :value="id"
                    @change="changeAccent(id)"
                  />
                  <span>{{ ACCENT_NAMES[id] }}</span>
                </label>
              </fieldset>
            </div>
          </PanelFrame>

          <PanelFrame
            v-if="flags.isOn('appearance.motion')"
            id="st-appearance"
            heading="Appearance"
            class="desk-settings-section"
          >
            <div class="desk-settings-body">
              <AppearanceSettings :theme="theme" />
            </div>
          </PanelFrame>
        </div>
      </section>

      <section id="sg-data" class="desk-settings-group" aria-labelledby="sg-data-h">
        <h2 id="sg-data-h" class="desk-settings-group-title">Your data</h2>
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame id="st-capture" heading="Phone capture" class="desk-settings-section">
            <div class="desk-settings-body">
              <p class="desk-settings-help">
                Send expenses from your phone (iOS Shortcuts, MacroDroid) without opening the app.
              </p>
              <div>
                <Button variant="secondary" @click="router.push('/settings/capture')">
                  Manage capture address
                </Button>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame id="st-export" heading="Export" class="desk-settings-section">
            <div class="desk-settings-body">
              <div>
                <Button variant="secondary" @click="downloadExport">Download my data</Button>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame id="st-delete" heading="Delete account" class="desk-settings-section">
            <div class="desk-settings-body">
              <div><Button variant="danger" @click="deleteOpen = true">Delete account</Button></div>
            </div>
          </PanelFrame>
        </div>
      </section>
    </div>

    <Dialog :open="deleteOpen" title="Delete your account" @close="deleteOpen = false">
      <p>
        This permanently deletes your account, expenses, categories and Notion connection. This
        cannot be undone.
      </p>
      <Input v-model="deleteConfirmText" label='Type "DELETE" to confirm' />
      <Input v-model="deletePassword" type="password" label="Current password (if set)" />
      <p v-if="deleteError" role="alert" class="desk-settings-error">{{ deleteError }}</p>
      <div class="desk-settings-dialog-actions">
        <Button variant="secondary" @click="deleteOpen = false">Cancel</Button>
        <Button
          variant="danger"
          :loading="deleteSubmitting"
          :disabled="deleteSubmitting"
          @click="confirmDelete"
        >
          Permanently delete
        </Button>
      </div>
    </Dialog>
  </main>
</template>

<style scoped>
.desk-sr-only {
  position: absolute;
  font-size: var(--text-md);
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.desk-settings-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--space-4);
}
.desk-settings-title {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
/* The section index is a scrolling row of links; the panels below reflow on .board-grid. */
.desk-settings-index {
  display: flex;
  gap: var(--space-4);
  margin-inline: calc(-1 * var(--gutter-fluid));
  padding-inline: var(--gutter-fluid);
  overflow-x: auto;
  scroll-padding-inline: var(--gutter-fluid);
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-border);
}
/* Below 1024 the row lists the groups only; the per-section links join them in the sticky column. */
.desk-settings-index-group {
  display: contents;
}
.desk-settings-index-heading,
.desk-settings-index-link {
  display: flex;
  align-items: center;
  flex: none;
  min-height: var(--target-min);
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
}
.desk-settings-index-link {
  display: none;
}
.desk-settings-index-heading:hover,
.desk-settings-index-link:hover {
  color: var(--color-fg);
}
.desk-settings-index-heading:focus-visible,
.desk-settings-index-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-settings-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  min-width: 0;
}
.desk-settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  scroll-margin-top: var(--space-4);
}
.desk-settings-group-title {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-settings-group-grid {
  gap: var(--space-4);
  width: 100%;
  margin-inline: 0;
}
.desk-settings-section {
  scroll-margin-top: var(--space-4);
}
.desk-settings-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.desk-settings-body--start > :first-child {
  align-self: flex-start;
}
.desk-settings-body p,
.desk-settings-note p {
  margin: 0;
}
.desk-settings-label {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
.desk-settings-help {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  max-width: 60ch;
}
.desk-settings-fig {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
}
.desk-settings-value {
  overflow-wrap: anywhere;
}
.desk-settings-status {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-warn);
}
.desk-settings-note {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-inline-start: var(--space-1) solid var(--color-warn);
  background: var(--color-surface-raised);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-settings-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 28rem;
}
.desk-settings-error {
  color: var(--color-critical);
}
.desk-settings-list {
  margin: 0;
  padding-left: var(--space-5);
}
.desk-settings-fieldset {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
}
.desk-settings-fieldset legend {
  float: left;
  margin-right: var(--space-2);
}
.desk-settings-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  cursor: pointer;
}
.desk-settings-radio input {
  width: var(--space-6);
  height: var(--space-6);
  margin: 0;
}
@media (max-width: 767px) {
  .desk-settings-radio input {
    width: var(--target-min);
    height: var(--target-min);
  }
}
.desk-settings-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
}
.desk-settings-current {
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
}
.desk-settings-seen-inline {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (max-width: 479px) {
  .desk-settings-seen-inline {
    white-space: normal;
  }
}
.desk-settings-dialog-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
/* Accent swatches: native radios drawn as filled squares in the preset's own colour. Selected shows
   as a ring plus an inner rule (not colour alone); the name always sits beside the swatch. */
.desk-settings-accents {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
}
.desk-settings-accents legend {
  width: 100%;
  padding: 0;
  margin-bottom: var(--space-2);
}
.desk-settings-accent {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  cursor: pointer;
}
.desk-settings-accent input {
  appearance: none;
  flex: none;
  width: var(--space-6);
  height: var(--space-6);
  margin: 0;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  cursor: pointer;
}
.desk-settings-accent input:checked {
  outline: 2px solid var(--color-fg);
  outline-offset: 2px;
  box-shadow: inset 0 0 0 var(--space-1) var(--color-accent-fg);
}
.desk-settings-accent input:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-settings-accent input:checked + span {
  font-weight: 600;
}
@media (max-width: 767px) {
  .desk-settings-accents {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .desk-settings-accents legend {
    grid-column: 1 / -1;
  }
  .desk-settings-accent input {
    width: var(--target-min);
    height: var(--target-min);
  }
}
/* The panel heading already names the field; its label stays as the accessible name only. */
.desk-settings-currency :deep(.desk-field-label) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Sessions: the last-seen stamp and the current-session word fit on one line. The table is a
   grandchild of this component's scope (DataTable's root is its wrapper), hence :deep from the top. */
:deep(.desk-sessions-table.desk-data-table .desk-col--action) {
  width: 6rem;
}
:deep(.desk-sessions-table.desk-data-table .desk-item-cat) {
  display: block;
}
@media (min-width: 1024px) {
  .desk-settings-view {
    grid-template-columns: 12rem minmax(0, 1fr);
    grid-template-areas:
      'title title'
      'index sections';
    column-gap: var(--space-10);
  }
  .desk-settings-title {
    grid-area: title;
  }
  .desk-settings-index {
    grid-area: index;
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
  .desk-settings-index-group {
    display: flex;
    flex-direction: column;
  }
  .desk-settings-index-group + .desk-settings-index-group {
    margin-top: var(--space-3);
  }
  .desk-settings-index-heading {
    min-height: var(--space-8);
    padding-left: var(--space-3);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }
  .desk-settings-index-link {
    display: flex;
    min-height: var(--space-8);
    padding-left: var(--space-6);
    font-weight: 400;
  }
  .desk-settings-sections {
    grid-area: sections;
    margin-inline: 0;
  }
}
</style>
