<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CategoryResponseT } from '@desk/contracts';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  MenuButton,
  Select,
  Skeleton,
  useToast,
  type BoardColumn,
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

const columns: BoardColumn[] = [
  { key: 'name', label: 'Category' },
  { key: 'kind', label: 'Kind', hideBelow: 'md' },
  { key: 'budget', label: 'Budget', align: 'end', width: 'amount' },
];
const budgetText = (c: CategoryResponseT) =>
  c.budgetMinor != null
    ? formatMoney(c.budgetMinor, session.user?.defaultCurrency ?? 'GBP')
    : 'No budget';

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

const rowActions = (c: CategoryResponseT) => [
  { id: 'archive', label: 'Archive' },
  ...(c.name !== 'Other' ? [{ id: 'delete', label: 'Delete' }] : []),
];
function onRowAction(id: string, c: CategoryResponseT) {
  if (id === 'archive') void toggleArchive(c);
  else void remove(c);
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
      <DataTable :columns="columns" dense caption="Categories" class="desk-categories-table">
        <tr v-for="c in active" :key="c.id">
          <td>
            <span class="desk-item">
              <span class="desk-categories-name">
                <span class="desk-categories-swatch" :style="{ backgroundColor: c.colour }" />
                <Button
                  variant="ghost"
                  class="desk-categories-edit"
                  :aria-label="`Edit ${c.name}`"
                  @click="openEdit(c)"
                  >{{ c.name }}</Button
                >
              </span>
              <span class="desk-item-actions">
                <MenuButton
                  :label="`Actions for ${c.name}`"
                  :items="rowActions(c)"
                  @select="(id) => onRowAction(id, c)"
                />
              </span>
            </span>
          </td>
          <td class="desk-col--md">{{ c.defaultKind ?? '—' }}</td>
          <td class="desk-col--amount">{{ budgetText(c) }}</td>
        </tr>
      </DataTable>

      <template v-if="archived.length > 0">
        <h2>Archived</h2>
        <DataTable
          :columns="columns"
          dense
          caption="Archived categories"
          class="desk-categories-table desk-categories-table-archived"
        >
          <tr v-for="c in archived" :key="c.id">
            <td>
              <span class="desk-item">
                <span class="desk-categories-name">
                  <span class="desk-categories-swatch" :style="{ backgroundColor: c.colour }" />
                  <span class="desk-item-name">{{ c.name }}</span>
                </span>
                <span class="desk-item-actions">
                  <Button variant="ghost" size="sm" @click="toggleArchive(c)">Unarchive</Button>
                </span>
              </span>
            </td>
            <td class="desk-col--md">{{ c.defaultKind ?? '—' }}</td>
            <td class="desk-col--amount">{{ budgetText(c) }}</td>
          </tr>
        </DataTable>
      </template>
    </template>

    <Dialog
      :open="showDialog"
      :title="editing ? 'Edit category' : 'Add category'"
      placement="bottom"
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
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.desk-categories-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.desk-review-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-3);
  border-inline-start: var(--space-1) solid var(--color-warn);
  background: var(--color-surface);
  box-shadow: var(--shadow-raised);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-categories-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.desk-categories-edit {
  font-size: var(--text-sm);
  min-width: 0;
  text-align: start;
  overflow-wrap: anywhere;
}
.desk-categories-swatch {
  flex: none;
  width: var(--space-3);
  height: var(--space-3);
  display: inline-block;
}
.desk-categories-table :deep(.desk-item-actions) {
  gap: 0;
}
.desk-categories-table-archived {
  opacity: 0.7;
}
.desk-categories-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.desk-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.desk-field input[type='color'] {
  inline-size: var(--space-12);
  min-block-size: var(--target-min);
}
.desk-field-label {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
</style>
