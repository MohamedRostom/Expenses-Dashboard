<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CategoryResponseT } from '@desk/contracts';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@desk/ui';
import { formatMajor, parseMajor } from '@desk/core';
import { apiFetch, ApiError } from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { useSessionStore } from '../stores/session.js';

const session = useSessionStore();
const toast = useToast();

const categories = ref<CategoryResponseT[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const showDialog = ref(false);
const editing = ref<CategoryResponseT | null>(null);

const form = ref({ name: '', colour: '#1f6e5a', defaultKind: '', budgetMajor: '' });

/** T065: shown once after a currency change (marker set by SettingsView), dismissible. */
const showReviewBanner = ref(false);
function checkReviewBanner() {
  try {
    showReviewBanner.value = sessionStorage.getItem('desk_currency_changed_at') !== null;
  } catch {
    showReviewBanner.value = false;
  }
}
function dismissReviewBanner() {
  showReviewBanner.value = false;
  try {
    sessionStorage.removeItem('desk_currency_changed_at');
  } catch {
    // ignore
  }
}

const kindOptions = [
  { value: '', label: 'No default' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
  { value: 'one_off', label: 'One-off' },
];

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await apiFetch<{ categories: CategoryResponseT[] }>('/categories');
    categories.value = res.categories.sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (err) {
    error.value = err instanceof ApiError ? err.code : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  checkReviewBanner();
});

const active = computed(() => categories.value.filter((c) => !c.archivedAt));
const archived = computed(() => categories.value.filter((c) => c.archivedAt));

function openAdd() {
  editing.value = null;
  form.value = { name: '', colour: '#1f6e5a', defaultKind: '', budgetMajor: '' };
  showDialog.value = true;
}
function openEdit(c: CategoryResponseT) {
  editing.value = c;
  form.value = {
    name: c.name,
    colour: c.colour,
    defaultKind: c.defaultKind ?? '',
    budgetMajor:
      c.budgetMinor != null
        ? formatMajor({ minor: c.budgetMinor, currency: session.user?.defaultCurrency ?? 'GBP' })
        : '',
  };
  showDialog.value = true;
}

async function save() {
  const budgetMinor = form.value.budgetMajor
    ? parseMajor(form.value.budgetMajor, session.user?.defaultCurrency ?? 'GBP').minor
    : null;
  const payload = {
    name: form.value.name,
    colour: form.value.colour,
    defaultKind: form.value.defaultKind
      ? (form.value.defaultKind as 'fixed' | 'variable' | 'one_off')
      : null,
    budgetMinor,
  };
  try {
    if (editing.value) {
      await apiFetch(`/categories/${editing.value.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/categories', { method: 'POST', body: JSON.stringify(payload) });
    }
    showDialog.value = false;
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}

async function toggleArchive(c: CategoryResponseT) {
  try {
    await apiFetch(`/categories/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: !c.archivedAt }),
    });
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}

async function remove(c: CategoryResponseT) {
  try {
    await apiFetch(`/categories/${c.id}`, { method: 'DELETE' });
    await load();
    toast.push(`Deleted "${c.name}" — its expenses moved to "Other".`);
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Something went wrong.', 'critical');
  }
}
</script>

<template>
  <main class="desk-categories-view">
    <header class="desk-categories-header">
      <h1>Categories</h1>
      <Button @click="openAdd">Add category</Button>
    </header>

    <div v-if="showReviewBanner" class="desk-review-banner" data-testid="review-budgets-banner">
      <span>Your default currency changed — review your category budgets.</span>
      <button type="button" @click="dismissReviewBanner">Dismiss</button>
    </div>

    <Skeleton v-if="loading" height="12rem" />
    <ErrorState v-else-if="error" :code="error ?? undefined" />
    <EmptyState v-else-if="categories.length === 0" title="No categories yet" />
    <template v-else>
      <ul class="desk-categories-list">
        <li v-for="c in active" :key="c.id" class="desk-categories-row">
          <span class="desk-categories-swatch" :style="{ backgroundColor: c.colour }" />
          <span class="desk-categories-name">{{ c.name }}</span>
          <span class="desk-categories-kind">{{ c.defaultKind ?? '—' }}</span>
          <span class="desk-categories-budget">{{
            c.budgetMinor != null
              ? formatMoney(c.budgetMinor, session.user?.defaultCurrency ?? 'GBP')
              : 'No budget'
          }}</span>
          <span class="desk-categories-actions">
            <button type="button" @click="openEdit(c)">Edit</button>
            <button type="button" @click="toggleArchive(c)">Archive</button>
            <button v-if="c.name !== 'Other'" type="button" @click="remove(c)">Delete</button>
          </span>
        </li>
      </ul>

      <template v-if="archived.length > 0">
        <h2>Archived</h2>
        <ul class="desk-categories-list">
          <li
            v-for="c in archived"
            :key="c.id"
            class="desk-categories-row desk-categories-row-archived"
          >
            <span class="desk-categories-swatch" :style="{ backgroundColor: c.colour }" />
            <span class="desk-categories-name">{{ c.name }}</span>
            <span class="desk-categories-kind">{{ c.defaultKind ?? '—' }}</span>
            <span class="desk-categories-budget">{{
              c.budgetMinor != null
                ? formatMoney(c.budgetMinor, session.user?.defaultCurrency ?? 'GBP')
                : 'No budget'
            }}</span>
            <span class="desk-categories-actions">
              <button type="button" @click="toggleArchive(c)">Unarchive</button>
            </span>
          </li>
        </ul>
      </template>
    </template>

    <Dialog
      :open="showDialog"
      :title="editing ? 'Edit category' : 'Add category'"
      @close="showDialog = false"
    >
      <form class="desk-categories-form" @submit.prevent="save">
        <Input v-model="form.name" label="Name" placeholder="Category name" />
        <label class="desk-field">
          <span class="desk-field-label">Colour</span>
          <input v-model="form.colour" type="color" />
        </label>
        <Select v-model="form.defaultKind" label="Default kind" :options="kindOptions" />
        <Input
          v-model="form.budgetMajor"
          label="Monthly budget"
          type="number"
          placeholder="No budget"
        />
        <Button type="submit">Save</Button>
      </form>
    </Dialog>
  </main>
</template>

<style scoped>
.desk-categories-view {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.desk-categories-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.desk-review-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-warn) 15%, transparent);
  color: var(--color-warn);
  font-size: 0.85rem;
}
.desk-review-banner button {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.desk-categories-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.desk-categories-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  font-size: 0.9rem;
}
.desk-categories-row-archived {
  opacity: 0.6;
}
.desk-categories-swatch {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  display: inline-block;
}
.desk-categories-budget {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-categories-actions {
  display: flex;
  gap: 0.5rem;
}
.desk-categories-actions button {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
.desk-categories-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.desk-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.desk-field-label {
  font-size: 0.8rem;
  opacity: 0.7;
}
</style>
