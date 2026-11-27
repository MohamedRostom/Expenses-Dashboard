<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
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
import type {
  JobResponseT,
  PatchMeResponseT,
  SessionSummaryT,
  TemperatureUnitT,
} from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';
import { describeDevice, formatSeen } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';
import { useFeedback } from '../composables/useFeedback.js';
import { useFlagsStore } from '../stores/flags.js';
import { useWidgetsStore } from '../stores/widgets.js';
import CurrencyPicker from '../components/CurrencyPicker.vue';
import AppearanceSettings from '../components/appearance/AppearanceSettings.vue';
import { applyTheme } from './theme.js';

const session = useSessionStore();
const { openFeedback } = useFeedback();
const router = useRouter();
const route = useRoute();
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

// One source for the tab labels, the panels' order and hash resolution.
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
// Appearance exists only while a flag is on (motion: spec 006; accent and colours: ADR-0008).
const showAppearance = computed(
  () => flags.isOn('appearance.motion') || flags.isOn('appearance.accent'),
);
const sessionColumns: BoardColumn[] = [
  { key: 'device', label: 'Device' },
  { key: 'actions', label: 'Actions', srOnly: true, width: 'action' },
];
const theme = ref<string>(session.user?.theme ?? 'system');
const themeSubmitting = ref(false);

const flags = useFlagsStore();

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

// Tabs: `#sg-GROUP` selects a tab; `#st-SECTION` (and the legacy `#appearance`, the sidebar link)
// selects the tab holding that section, then scrolls to it. The router has no scrollBehavior, so
// this runs on mount and whenever the hash changes while Settings is open.
type GroupId = (typeof ALL_GROUPS)[number]['id'];
const activeTab = ref<GroupId>('account');
function selectFromHash() {
  const h = route.hash;
  const sectionId = h === '#appearance' ? 'appearance' : h.startsWith('#st-') ? h.slice(4) : '';
  const group =
    ALL_GROUPS.find((g) => h === `#sg-${g.id}`) ??
    ALL_GROUPS.find((g) => g.sections.some((s) => s.id === sectionId));
  if (!group) return;
  activeTab.value = group.id;
  // With the flags off there is no Appearance panel: the Look tab opens with nothing to scroll to.
  if (sectionId && (sectionId !== 'appearance' || showAppearance.value))
    void nextTick(() => document.getElementById(`st-${sectionId}`)?.scrollIntoView());
}
watch(() => route.hash, selectFromHash);
function selectTab(id: GroupId) {
  activeTab.value = id;
  void router.replace({ hash: `#sg-${id}` });
}
function onTabKey(e: KeyboardEvent, i: number) {
  const n = ALL_GROUPS.length;
  const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  selectTab(ALL_GROUPS[to]!.id);
  (e.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLElement>('[role="tab"]')
    [to]?.focus();
}

// Replaces the old header links the four-item nav dropped; Mail and calendar accounts follows its flag.
const TOOLS = computed(() => [
  { to: '/settings/categories', label: 'Categories', hint: 'Names, kinds and monthly budgets.' },
  { to: '/import', label: 'Import', hint: 'Bring in expenses from a CSV file.' },
  { to: '/bin', label: 'Bin', hint: 'Restore or permanently remove deleted expenses.' },
  {
    to: '/settings/connectors',
    label: 'Notion sync',
    hint: 'Link Notion to keep expenses in sync.',
  },
  ...(flags.isOn('panels.today')
    ? [
        {
          to: '/settings/connections',
          label: 'Mail and calendar accounts',
          hint: 'Calendar and inbox accounts for the Today view.',
        },
      ]
    : []),
  { to: '/settings/capture', label: 'Capture', hint: 'Your phone capture address and key.' },
]);

// Columns for the tools grid: 3 when the count divides, else 2 or 3; the last item takes the
// remaining cells of its row, so the grid has no hole with or without the Connections flag.
const toolCols = computed(() => {
  const n = TOOLS.value.length;
  return n % 3 === 0 || n % 2 !== 0 ? 3 : 2;
});
const toolSpan = (i: number) => {
  const n = TOOLS.value.length;
  const cols = toolCols.value;
  return i === n - 1 && n % cols !== 0 ? cols - (n % cols) + 1 : 1;
};

async function signOut() {
  await session.logout();
  await router.replace('/login');
}

onMounted(() => {
  selectFromHash();
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
    <div class="desk-settings-sections">
      <section class="desk-settings-tools surface" aria-labelledby="desk-tools-h">
        <h2 id="desk-tools-h" class="desk-settings-group-title">Data and tools</h2>
        <ul
          class="desk-settings-tools-list"
          data-testid="data-tools"
          :style="{ '--cols': toolCols }"
        >
          <li v-for="(t, i) in TOOLS" :key="t.to" :style="{ '--span': toolSpan(i) }">
            <RouterLink :to="t.to" class="desk-settings-tool">{{ t.label }}</RouterLink>
            <p class="desk-settings-help">{{ t.hint }}</p>
          </li>
        </ul>
        <div class="desk-settings-feedback">
          <Button variant="secondary" data-testid="feedback-settings" @click="openFeedback">
            Feedback
          </Button>
        </div>
        <div class="desk-settings-signout">
          <Button variant="secondary" data-testid="sign-out-settings" @click="signOut">
            Sign out
          </Button>
        </div>
      </section>

      <div class="desk-settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          v-for="(g, i) in ALL_GROUPS"
          :id="`sg-tab-${g.id}`"
          :key="g.id"
          type="button"
          role="tab"
          class="desk-settings-tab"
          :aria-selected="activeTab === g.id"
          :aria-controls="`sg-${g.id}`"
          :tabindex="activeTab === g.id ? 0 : -1"
          @click="selectTab(g.id)"
          @keydown="onTabKey($event, i)"
        >
          {{ g.title }}
        </button>
      </div>

      <div
        v-show="activeTab === 'account'"
        id="sg-account"
        class="desk-settings-group"
        role="tabpanel"
        aria-labelledby="sg-tab-account"
        tabindex="0"
      >
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame
            id="st-profile"
            heading="Profile"
            class="desk-settings-section desk-settings-section--wide"
          >
            <div class="desk-settings-body desk-settings-body--split">
              <div class="desk-settings-identity">
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
                <div class="desk-settings-actions">
                  <Button type="submit" :loading="emailSubmitting" :disabled="emailSubmitting">
                    Change email
                  </Button>
                </div>
              </form>
            </div>
          </PanelFrame>

          <PanelFrame
            id="st-sessions"
            heading="Sessions"
            class="desk-settings-section desk-settings-section--wide"
          >
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
      </div>

      <div
        v-show="activeTab === 'preferences'"
        id="sg-preferences"
        class="desk-settings-group"
        role="tabpanel"
        aria-labelledby="sg-tab-preferences"
        tabindex="0"
      >
        <div class="board-grid desk-settings-group-grid desk-settings-group-grid--thirds">
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
                <div class="desk-settings-actions">
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
      </div>

      <div
        v-show="activeTab === 'look'"
        id="sg-look"
        class="desk-settings-group"
        role="tabpanel"
        aria-labelledby="sg-tab-look"
        tabindex="0"
      >
        <div class="board-grid desk-settings-group-grid">
          <PanelFrame
            id="st-theme"
            heading="Theme"
            class="desk-settings-section desk-settings-section--wide"
          >
            <div class="desk-settings-body desk-settings-body--start">
              <ThemeToggle v-model="theme" label="Theme" @update:model-value="changeTheme" />
            </div>
          </PanelFrame>

          <PanelFrame
            v-if="showAppearance"
            id="st-appearance"
            heading="Appearance"
            class="desk-settings-section desk-settings-section--wide"
          >
            <div id="appearance" class="desk-settings-body">
              <AppearanceSettings
                :theme="theme"
                :motion="flags.isOn('appearance.motion')"
                :colours="flags.isOn('appearance.accent')"
              />
            </div>
          </PanelFrame>
        </div>
      </div>

      <div
        v-show="activeTab === 'data'"
        id="sg-data"
        class="desk-settings-group"
        role="tabpanel"
        aria-labelledby="sg-tab-data"
        tabindex="0"
      >
        <div class="board-grid desk-settings-group-grid desk-settings-group-grid--thirds">
          <PanelFrame id="st-capture" heading="Phone capture" class="desk-settings-section">
            <div class="desk-settings-body">
              <p class="desk-settings-help">
                Send expenses from your phone (iOS Shortcuts, MacroDroid) without opening the app.
              </p>
              <p class="desk-settings-help">Manage the address under Data and tools above.</p>
            </div>
          </PanelFrame>

          <PanelFrame id="st-export" heading="Export" class="desk-settings-section">
            <div class="desk-settings-body">
              <div class="desk-settings-actions">
                <Button variant="secondary" @click="downloadExport">Download my data</Button>
              </div>
            </div>
          </PanelFrame>

          <PanelFrame id="st-delete" heading="Delete account" class="desk-settings-section">
            <div class="desk-settings-body">
              <div class="desk-settings-actions">
                <Button variant="danger" @click="deleteOpen = true">Delete account</Button>
              </div>
            </div>
          </PanelFrame>
        </div>
      </div>
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
  /* The month view's 1160px panel grid, plus the gutters this padding takes out. */
  max-width: calc(1160px + 2 * var(--gutter-fluid));
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--space-4);
}
/* Data and tools: a glass panel of real links, with Sign out set apart below a rule. */
.desk-settings-tools {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-xl);
}
.desk-settings-tools-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3) var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}
.desk-settings-tools-list p {
  margin: 0;
}
.desk-settings-tool {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  color: var(--color-fg);
  font-weight: 600;
  text-underline-offset: 3px;
}
.desk-settings-tool:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-field);
}
.desk-settings-feedback {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}
/* The sidebar carries Feedback and Sign out from 1024px; the page rows are for phones. They stay
   in the DOM (the sign-out test hook and focus order are unchanged). */
@media (min-width: 1024px) {
  .desk-settings-feedback,
  .desk-settings-signout {
    display: none;
  }
}
/* Tabs: one row of four, scrolling sideways if a phone is too narrow; the panels below reflow on .board-grid. */
.desk-settings-tabs {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-border);
}
.desk-settings-tab {
  flex: none;
  min-height: var(--target-min);
  padding: 0 var(--space-1);
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-fg-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.desk-settings-tab:hover {
  color: var(--color-fg);
}
.desk-settings-tab[aria-selected='true'] {
  color: var(--color-fg);
  border-bottom-color: var(--color-accent);
}
.desk-settings-tab:focus-visible,
.desk-settings-group:focus-visible {
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
/* One column below 768, two from 768 (three for the short-card groups from 1440, where the sidebar leaves them room). Cards in a row
   stretch to one height; a wide card or a lone last card takes the whole row, so there are no holes
   whichever flags hide a card. */
.desk-settings-group-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  width: 100%;
  max-width: none;
  margin-inline: 0;
  align-items: stretch;
}
.desk-settings-section {
  scroll-margin-top: var(--space-4);
}
/* The flap fills the cell, and the body fills the flap, so an action row can sit at the bottom. */
.desk-settings-section :deep(.desk-panel-frame-flap) {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.desk-settings-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4) var(--space-3);
}
.desk-settings-body--split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: var(--space-4) var(--space-8);
  align-content: start;
}
.desk-settings-identity {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
/* The action row of a card sits at its bottom-left, whatever the card above it holds. */
.desk-settings-actions {
  margin-top: auto;
}
.desk-settings-form {
  flex: 1;
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
  max-width: 36rem;
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
/* A gap between the Sessions title and its column heads (Bin does the same for its table). */
.desk-settings-section :deep(.desk-data-table-wrap--board) {
  padding-block-start: var(--space-3);
}
@media (min-width: 768px) {
  .desk-settings-group-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .desk-settings-section--wide,
  .desk-settings-section:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  .desk-settings-tools-list {
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  }
  .desk-settings-tools-list > li:last-child {
    grid-column: span var(--span);
  }
}
@media (min-width: 1440px) {
  .desk-settings-group-grid--thirds {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .desk-settings-group-grid--thirds > .desk-settings-section:last-child:nth-child(odd) {
    grid-column: auto;
  }
}
</style>
