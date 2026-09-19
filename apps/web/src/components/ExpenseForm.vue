<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CategoryResponseT, ExpenseResponseT, RatePreviewResponseT } from '@desk/contracts';
import { Button, Input, Select } from '@desk/ui';
import { formatMajor, parseMajor } from '@desk/core';
import CurrencyPicker from './CurrencyPicker.vue';
import VersionHistory from './VersionHistory.vue';
import { apiFetch } from '../api/client.js';
import { useSessionStore } from '../stores/session.js';
import { useExpensesStore } from '../stores/expenses.js';
import { enqueue } from '../offline/queue.js';

const props = defineProps<{ expense?: ExpenseResponseT | undefined; autofocus?: boolean }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const session = useSessionStore();
const expenses = useExpensesStore();
const isEdit = computed(() => !!props.expense);

const description = ref(props.expense?.description ?? '');
const amountMajor = ref(
  props.expense
    ? formatMajor({ minor: props.expense.amountOriginal, currency: props.expense.currencyOriginal })
    : '',
);
const currency = ref(props.expense?.currencyOriginal ?? session.user?.defaultCurrency ?? 'GBP');
/** Today's date in the LOCAL calendar, not UTC — toISOString().slice(0,10) shows tomorrow's
 * date for anyone east of UTC in the evening, or yesterday's for anyone west of it. */
function todayLocal(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}
const date = ref(props.expense?.date ?? todayLocal());
const paidWith = ref(props.expense?.paidWith ?? 'card');
const kind = ref(props.expense?.kind ?? 'variable');
const notes = ref(props.expense?.notes ?? '');
const rateOverride = ref('');
const showRateOverride = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const categoryId = ref<string>(props.expense?.categoryId ?? '');
const categories = ref<CategoryResponseT[]>([]);
const categoryOptions = computed(() => [
  { value: '', label: 'No category' },
  ...categories.value
    .filter((c) => !c.archivedAt || c.id === props.expense?.categoryId)
    .map((c) => ({ value: c.id, label: c.name })),
]);
const formEl = ref<HTMLFormElement | null>(null);

onMounted(async () => {
  if (props.autofocus) formEl.value?.querySelector('input')?.focus();
  try {
    const res = await apiFetch<{ categories: CategoryResponseT[] }>('/categories');
    categories.value = res.categories;
  } catch {
    categories.value = [];
  }
});

const paidWithOptions = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];
const kindOptions = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
  { value: 'one_off', label: 'One-off' },
];

const preview = ref<RatePreviewResponseT | null>(null);
const previewLoading = ref(false);
let previewTimer: ReturnType<typeof setTimeout> | undefined;

watch([currency, date, amountMajor], () => {
  clearTimeout(previewTimer);
  preview.value = null;
  const defaultCurrency = session.user?.defaultCurrency;
  if (!defaultCurrency || currency.value === defaultCurrency || !amountMajor.value) return;
  previewTimer = setTimeout(async () => {
    previewLoading.value = true;
    try {
      preview.value = await apiFetch<RatePreviewResponseT>(
        `/rates?date=${encodeURIComponent(date.value)}&from=${currency.value}&to=${defaultCurrency}`,
      );
    } catch {
      preview.value = { unsupported: true };
    } finally {
      previewLoading.value = false;
    }
  }, 400);
});

const convertedPreview = computed(() => {
  if (!preview.value) return null;
  if ('unsupported' in preview.value) return 'rate unavailable';
  const amount = Number(amountMajor.value) * Number(preview.value.rate);
  if (Number.isNaN(amount)) return null;
  return `≈ ${amount.toFixed(2)} ${session.user?.defaultCurrency}`;
});

async function onSubmit() {
  submitError.value = null;
  if (isEdit.value && !navigator.onLine) {
    submitError.value = 'Editing needs a connection — only new expenses can be added offline';
    return;
  }
  let minor: number;
  try {
    minor = parseMajor(amountMajor.value, currency.value).minor;
  } catch {
    submitError.value = 'Enter a description and a positive amount';
    return;
  }
  if (!description.value || minor <= 0) {
    submitError.value = 'Enter a description and a positive amount';
    return;
  }
  submitting.value = true;
  try {
    if (!isEdit.value && !navigator.onLine) {
      // ponytail: add-only offline (research.md R13) — edits still require the network.
      await enqueue({
        description: description.value,
        amount: { minor, currency: currency.value },
        date: date.value,
        categoryId: categoryId.value || null,
        paidWith: paidWith.value as never,
        kind: kind.value as never,
        notes: notes.value || undefined,
      });
      emit('saved');
      return;
    }
    if (isEdit.value && props.expense) {
      await expenses.update(props.expense.id, {
        description: description.value,
        amount: { minor, currency: currency.value },
        date: date.value,
        categoryId: categoryId.value || null,
        paidWith: paidWith.value as never,
        kind: kind.value as never,
        notes: notes.value || null,
        rateOverride: rateOverride.value ? { rate: rateOverride.value } : undefined,
      });
    } else {
      await expenses.create({
        description: description.value,
        amount: { minor, currency: currency.value },
        date: date.value,
        categoryId: categoryId.value || null,
        paidWith: paidWith.value as never,
        kind: kind.value as never,
        notes: notes.value || undefined,
      });
    }
    emit('saved');
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Could not save';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form ref="formEl" class="desk-expense-form" @submit.prevent="onSubmit">
    <Input v-model="description" label="Description" />
    <div class="desk-expense-form-row">
      <Input v-model="amountMajor" type="number" label="Amount" />
      <CurrencyPicker v-model="currency" label="Currency" />
    </div>
    <p v-if="previewLoading" class="desk-expense-form-preview">Checking rate…</p>
    <p v-else-if="convertedPreview" class="desk-expense-form-preview">{{ convertedPreview }}</p>

    <label class="desk-field">
      <span class="desk-field-label">Date</span>
      <input v-model="date" class="desk-input" type="date" />
    </label>

    <Select v-model="categoryId" label="Category" :options="categoryOptions" />

    <Select v-model="paidWith" label="Paid with" :options="paidWithOptions" />
    <Select v-model="kind" label="Kind" :options="kindOptions" />
    <Input v-model="notes" label="Notes (optional)" />

    <button
      type="button"
      class="desk-expense-form-toggle"
      @click="showRateOverride = !showRateOverride"
    >
      {{ showRateOverride ? 'Hide' : 'Set' }} manual rate
    </button>
    <Input
      v-if="showRateOverride"
      v-model="rateOverride"
      label="Rate override"
      placeholder="e.g. 1.234"
    />

    <p v-if="submitError" role="alert" class="desk-expense-form-error">{{ submitError }}</p>

    <VersionHistory v-if="props.expense?.notionPageId" :expense-id="props.expense.id" />

    <div class="desk-expense-form-actions">
      <Button type="submit" :loading="submitting">{{ isEdit ? 'Save' : 'Add expense' }}</Button>
      <Button type="button" variant="secondary" @click="$emit('cancel')">Cancel</Button>
    </div>
  </form>
</template>

<style scoped>
.desk-expense-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  width: 100%;
  max-width: 20rem;
}
.desk-expense-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.desk-expense-form-row > * {
  flex: 1 1 8rem;
}
.desk-expense-form-preview {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  margin: -0.25rem 0 0;
  opacity: 0.8;
}
.desk-expense-form-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
.desk-expense-form-error {
  color: var(--color-critical);
  font-size: 0.85rem;
  margin: 0;
}
.desk-expense-form-actions {
  display: flex;
  gap: 0.5rem;
}
.desk-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.desk-field-label {
  font-size: 0.85rem;
}
.desk-input {
  font-family: var(--font-sans);
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-fg);
  background: var(--color-bg);
  color: var(--color-fg);
}
</style>
