<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type {
  ImportProfileResponseT,
  ImportBatchResponseT,
  ImportRowResponseT,
} from '@desk/contracts';
import { Button, Input, Select, Skeleton, useToast } from '@desk/ui';
import { ApiError, readCookie } from '../api/client.js';
import { formatMoney } from '../utils/format.js';

const toast = useToast();

const step = ref<1 | 2 | 3 | 4>(1);
const loading = ref(false);

// Step 1: file
const file = ref<File | null>(null);
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
}

// Step 2: mapping
const profiles = ref<ImportProfileResponseT[]>([]);
const mapping = ref({
  date: 'date',
  amount: 'amount',
  currency: 'currency',
  description: 'description',
  category: '',
  id: '',
  dateFormat: 'YYYY-MM-DD' as 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY',
  decimalSeparator: '.' as '.' | ',',
});
const profileName = ref('');
const saveAsProfile = ref(false);

const dateFormatOptions = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
];
const decimalOptions = [
  { value: '.', label: 'Point (12.50)' },
  { value: ',', label: 'Comma (12,50)' },
];

async function loadProfiles() {
  try {
    const res = await fetch('/imports/profiles', { credentials: 'include' });
    if (res.ok) {
      const body = (await res.json()) as { profiles: ImportProfileResponseT[] };
      profiles.value = body.profiles;
    }
  } catch {
    // profiles are a convenience — silently skip if unavailable
  }
}

function applyProfile(p: ImportProfileResponseT) {
  mapping.value = {
    date: p.mapping.date,
    amount: p.mapping.amount,
    currency: p.mapping.currency,
    description: p.mapping.description,
    category: p.mapping.category ?? '',
    id: p.mapping.id ?? '',
    dateFormat: p.mapping.dateFormat,
    decimalSeparator: p.mapping.decimalSeparator,
  };
  profileName.value = p.name;
}

// Step 3: preview
const batch = ref<ImportBatchResponseT | null>(null);
const skipRows = ref<Set<number>>(new Set());
const fixes = ref<
  Record<number, { date?: string; amountMinor?: number; currency?: string; description?: string }>
>({});
const error = ref<string | null>(null);

function buildMappingPayload() {
  const m: Record<string, unknown> = {
    date: mapping.value.date,
    amount: mapping.value.amount,
    currency: mapping.value.currency,
    description: mapping.value.description,
    dateFormat: mapping.value.dateFormat,
    decimalSeparator: mapping.value.decimalSeparator,
  };
  if (mapping.value.category) m.category = mapping.value.category;
  if (mapping.value.id) m.id = mapping.value.id;
  return m;
}

async function uploadAndPreview() {
  if (!file.value) return;
  loading.value = true;
  error.value = null;
  try {
    const form = new FormData();
    form.append('file', file.value);
    form.append('mapping', JSON.stringify(buildMappingPayload()));

    if (saveAsProfile.value && profileName.value) {
      const csrf = readCookie('__Host-desk_csrf');
      await fetch(`/imports/profiles/${encodeURIComponent(profileName.value)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify({ mapping: buildMappingPayload() }),
      });
    }

    const csrf = readCookie('__Host-desk_csrf');
    const res = await fetch('/imports', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiError('validation_failed', body?.error?.message ?? 'Upload failed', res.status);
    }
    const body = (await res.json()) as { batch: ImportBatchResponseT };
    batch.value = body.batch;
    skipRows.value = new Set();
    fixes.value = {};
    step.value = 3;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Something went wrong.';
    toast.push(error.value, 'critical');
  } finally {
    loading.value = false;
  }
}

function toggleSkip(rowNumber: number) {
  const next = new Set(skipRows.value);
  if (next.has(rowNumber)) next.delete(rowNumber);
  else next.add(rowNumber);
  skipRows.value = next;
}

const rows = computed<ImportRowResponseT[]>(() => batch.value?.rows ?? []);

// Step 4: commit summary
const summary = ref<{ createdExpenses: number; duplicates: number; errors: number } | null>(null);
const committedBatchId = ref<string | null>(null);

async function commit() {
  if (!batch.value) return;
  loading.value = true;
  try {
    const body = await import('../api/client.js').then(({ apiFetch }) =>
      apiFetch<{ batch: ImportBatchResponseT }>(`/imports/${batch.value!.id}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          skipRows: [...skipRows.value],
          fixes: Object.fromEntries(Object.entries(fixes.value).map(([k, v]) => [k, v])),
        }),
      }),
    );
    summary.value = {
      createdExpenses: body.batch.createdExpenses,
      duplicates: body.batch.duplicates,
      errors: body.batch.errors,
    };
    committedBatchId.value = body.batch.id;
    step.value = 4;
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Commit failed.', 'critical');
  } finally {
    loading.value = false;
  }
}

const undone = ref(false);
async function undo() {
  if (!committedBatchId.value) return;
  loading.value = true;
  try {
    const { apiFetch } = await import('../api/client.js');
    await apiFetch(`/imports/${committedBatchId.value}/undo`, { method: 'POST' });
    undone.value = true;
    toast.push('Import undone — expenses moved to the bin.');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Undo failed.', 'critical');
  } finally {
    loading.value = false;
  }
}

function startOver() {
  step.value = 1;
  file.value = null;
  batch.value = null;
  summary.value = null;
  committedBatchId.value = null;
  undone.value = false;
}

onMounted(loadProfiles);
</script>

<template>
  <main class="desk-import-view">
    <h1>Import expenses</h1>

    <section v-if="step === 1">
      <h2>1. Choose a CSV file</h2>
      <input type="file" accept=".csv" data-testid="import-file-input" @change="onFileChange" />
      <Button :disabled="!file" @click="step = 2">Next</Button>
    </section>

    <section v-else-if="step === 2">
      <h2>2. Map columns</h2>

      <div v-if="profiles.length > 0" class="desk-import-profiles">
        <span>Saved profiles:</span>
        <button
          v-for="p in profiles"
          :key="p.id"
          type="button"
          data-testid="import-profile-button"
          @click="applyProfile(p)"
        >
          {{ p.name }}
        </button>
      </div>

      <div class="desk-import-mapping-form">
        <Input v-model="mapping.date" label="Date column" />
        <Select v-model="mapping.dateFormat" label="Date format" :options="dateFormatOptions" />
        <Input v-model="mapping.amount" label="Amount column" />
        <Select
          v-model="mapping.decimalSeparator"
          label="Decimal separator"
          :options="decimalOptions"
        />
        <Input v-model="mapping.currency" label="Currency column" />
        <Input v-model="mapping.description" label="Description column" />
        <Input v-model="mapping.category" label="Category column (optional)" />
        <Input v-model="mapping.id" label="Id column (optional, for duplicate matching)" />

        <label class="desk-field">
          <input v-model="saveAsProfile" type="checkbox" />
          <span>Save this mapping as a profile</span>
        </label>
        <Input v-if="saveAsProfile" v-model="profileName" label="Profile name" />
      </div>

      <p v-if="error" role="alert">{{ error }}</p>
      <Button :disabled="loading" @click="uploadAndPreview">{{
        loading ? 'Uploading…' : 'Preview'
      }}</Button>
    </section>

    <section v-else-if="step === 3">
      <h2>3. Preview</h2>
      <Skeleton v-if="loading" height="12rem" />
      <div v-else class="desk-import-preview-wrap">
        <table class="desk-import-preview" data-testid="import-preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Skip</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.rowNumber" :data-status="row.status">
              <td>{{ row.rowNumber }}</td>
              <td>
                <span class="desk-import-status-badge" :data-status="row.status">{{
                  row.status
                }}</span>
                <span v-if="row.error">— {{ row.error }}</span>
              </td>
              <td>
                <input
                  v-if="row.status === 'error'"
                  :value="fixes[row.rowNumber]?.date ?? row.parsed?.date ?? ''"
                  @input="
                    fixes[row.rowNumber] = {
                      ...fixes[row.rowNumber],
                      date: ($event.target as HTMLInputElement).value,
                    }
                  "
                />
                <template v-else>{{ row.parsed?.date }}</template>
              </td>
              <td>
                {{
                  row.parsed?.amountMinor != null && row.parsed?.currency
                    ? formatMoney(row.parsed.amountMinor, row.parsed.currency)
                    : '—'
                }}
              </td>
              <td>{{ row.parsed?.description }}</td>
              <td>
                <input
                  type="checkbox"
                  :checked="skipRows.has(row.rowNumber)"
                  @change="toggleSkip(row.rowNumber)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Button :disabled="loading" @click="commit">{{
        loading ? 'Committing…' : 'Commit import'
      }}</Button>
    </section>

    <section v-else-if="step === 4">
      <h2>4. Done</h2>
      <p data-testid="import-summary">
        Created {{ summary?.createdExpenses }}, skipped duplicates {{ summary?.duplicates }}, errors
        {{ summary?.errors }}.
      </p>
      <Button v-if="!undone" :disabled="loading" @click="undo">Undo</Button>
      <p v-else>Undone.</p>
      <Button @click="startOver">Import another file</Button>
    </section>
  </main>
</template>

<style scoped>
.desk-import-view {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1rem;
}
.desk-import-mapping-form {
  display: grid;
  gap: 0.75rem;
  max-width: 24rem;
}
.desk-import-preview-wrap {
  overflow-x: auto;
}
.desk-import-preview {
  width: 100%;
  border-collapse: collapse;
}
.desk-import-preview th,
.desk-import-preview td {
  text-align: left;
  padding: 0.25rem 0.5rem;
  /* --desk-border/--desk-accent were never-defined tokens — the fallback always won, so this
   * silently ignored dark mode. color-mix matches the border style every other table in the app
   * uses (e.g. MonthView's entries table). */
  border-bottom: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
}
.desk-import-status-badge[data-status='ok'] {
  color: var(--color-accent);
}
.desk-import-status-badge[data-status='error'] {
  color: var(--color-critical);
}
.desk-import-status-badge[data-status='duplicate'] {
  color: #a8641a;
}
</style>
