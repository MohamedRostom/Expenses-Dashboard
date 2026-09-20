<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Dialog, Input, Select, useToast } from '@desk/ui';
import type { JobResponseT, PatchMeResponseT, SessionSummaryT } from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';
import { describeDevice, formatDateTime } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';
import CurrencyPicker from '../components/CurrencyPicker.vue';
import { applyTheme } from './theme.js';

const session = useSessionStore();
const router = useRouter();
const toast = useToast();

const newEmail = ref('');
const emailChangePassword = ref('');
const emailNotice = ref('');
const emailSubmitting = ref(false);
const emailError = ref('');

const currency = ref(session.user?.defaultCurrency ?? '');
const currencySubmitting = ref(false);
const job = ref<JobResponseT | null>(null);
let jobTimer: ReturnType<typeof setTimeout> | undefined;

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const theme = ref<string>(session.user?.theme ?? 'system');
const themeSubmitting = ref(false);

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

onMounted(loadSessions);
onBeforeUnmount(() => {
  if (jobTimer) clearTimeout(jobTimer);
});

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
  <div class="settings-view">
    <h1>Settings</h1>

    <section>
      <h2>Profile</h2>
      <p>Email: {{ session.user?.email }}</p>
      <form @submit.prevent="changeEmail">
        <Input v-model="newEmail" type="email" label="New email" placeholder="new@example.com" />
        <Input v-model="emailChangePassword" type="password" label="Current password (if set)" />
        <p v-if="emailNotice" role="status">{{ emailNotice }}</p>
        <p v-if="emailError" role="alert" class="error-text">{{ emailError }}</p>
        <Button type="submit" :loading="emailSubmitting" :disabled="emailSubmitting">
          Change email
        </Button>
      </form>
    </section>

    <section>
      <h2>Default currency</h2>
      <CurrencyPicker
        :model-value="currency"
        label="Default currency"
        @update:model-value="changeCurrency"
      />
      <p v-if="currencySubmitting && !job">Updating…</p>
      <p v-if="job && job.status !== 'done' && job.status !== 'failed'">
        Re-deriving expenses: {{ job.progressDone
        }}<span v-if="job.progressTotal !== null"> / {{ job.progressTotal }}</span>
      </p>
    </section>

    <section>
      <h2>Theme</h2>
      <Select
        v-model="theme"
        :options="THEME_OPTIONS"
        label="Theme"
        @update:model-value="changeTheme"
      />
    </section>

    <section>
      <h2>Time zone</h2>
      <p>Used to default the date on captures sent from your phone (e.g. iOS Shortcuts).</p>
      <form @submit.prevent="changeTimeZone">
        <Input v-model="timeZone" label="IANA time zone" placeholder="Europe/London" />
        <Button type="submit" :loading="timeZoneSubmitting" :disabled="timeZoneSubmitting">
          Save time zone
        </Button>
      </form>
    </section>

    <section>
      <h2>Sessions</h2>
      <p v-if="sessionsLoading">Loading sessions…</p>
      <p v-else-if="sessionsError" role="alert" class="error-text">{{ sessionsError }}</p>
      <ul v-else>
        <li v-for="s in sessions" :key="s.id">
          {{ describeDevice(s.userAgent) }} — last seen {{ formatDateTime(s.lastSeenAt) }}
          <span v-if="s.current"> (this session)</span>
          <Button v-if="!s.current" variant="secondary" @click="revokeSession(s.id)">
            Revoke
          </Button>
        </li>
      </ul>
    </section>

    <section>
      <h2>Phone capture</h2>
      <p>Send expenses from your phone (iOS Shortcuts, MacroDroid) without opening the app.</p>
      <Button variant="secondary" @click="router.push('/settings/capture')">
        Manage capture address
      </Button>
    </section>

    <section>
      <h2>Export</h2>
      <Button variant="secondary" @click="downloadExport">Download my data</Button>
    </section>

    <section>
      <h2>Delete account</h2>
      <Button variant="danger" @click="deleteOpen = true">Delete account</Button>
    </section>

    <Dialog :open="deleteOpen" title="Delete your account" @close="deleteOpen = false">
      <p>
        This permanently deletes your account, expenses, categories and Notion connection. This
        cannot be undone.
      </p>
      <Input v-model="deleteConfirmText" label='Type "DELETE" to confirm' />
      <Input v-model="deletePassword" type="password" label="Current password (if set)" />
      <p v-if="deleteError" role="alert" class="error-text">{{ deleteError }}</p>
      <div class="dialog-actions">
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
  </div>
</template>

<style scoped>
.settings-view {
  max-width: 32rem;
  margin: 2rem auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.error-text {
  color: var(--color-critical);
  margin: 0;
}
.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
