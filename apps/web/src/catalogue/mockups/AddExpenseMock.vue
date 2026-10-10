<script setup lang="ts">
/** T027 / FR-004: the add-expense sheet in the proposed identity, over the month board. Same
 * fields and order as components/ExpenseForm.vue (FR-010: no workflow change). T027a makes it
 * work: it validates, adds the row to the shared mock list (integer pence) and closes. No API.
 * Query: `?state=loading|empty|error`, `?live=off`. DOM contract: tests/e2e/tests/visual.spec.ts.
 * Loaded directly it shows the pending-rate demo; opened from the board it starts blank. */
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Input, Select, Skeleton } from '@desk/ui';
import './board.css';
import MonthViewMock from './MonthViewMock.vue';
import { useDialog } from './useDialog.js';
import { categoryNames } from '../fixtures.js';
import {
  addExpense,
  closeAddExpense,
  month,
  parseAmount,
  sheetBlank,
  toDefault,
} from './mockExpenses.js';

const route = useRoute();
const router = useRouter();
const state = computed(() => String(route.query['state'] ?? 'default'));
// Read once: the flag belongs to this opening of the sheet.
const blank = state.value === 'empty' || sheetBlank.value;
sheetBlank.value = false;

const description = ref(blank ? '' : 'Airport train');
const amount = ref(blank || state.value === 'error' ? '' : '52.00');
const currency = ref(blank ? 'GBP' : 'USD');
const date = ref(`${month.value.key}-${String(month.value.days).padStart(2, '0')}`);
const category = ref(blank || state.value === 'error' ? '' : 'Transport');
const paidWith = ref('Card');
const kind = ref(blank ? '' : 'Variable');
const notes = ref('');
const showRate = ref(false);
const submitted = ref(false);

const parsed = computed(() => parseAmount(amount.value));
const amountError = computed(() => {
  if (state.value === 'error') return 'Enter an amount, for example 52.00';
  return submitted.value && 'error' in parsed.value ? parsed.value.error : '';
});
const categoryError = computed(() =>
  state.value === 'error' || (submitted.value && !category.value) ? 'Choose a category' : '',
);
// A foreign-currency entry saves now and converts when the rate is published.
const showPreview = computed(
  () => state.value !== 'error' && currency.value !== 'GBP' && 'minor' in parsed.value,
);

const currencyOptions = ['GBP', 'USD', 'EUR'].map((c) => ({ value: c, label: c }));
const categoryOptions = [
  { value: '', label: 'Choose a category' },
  ...categoryNames.map((c) => ({ value: c, label: c })),
];
const paidWithOptions = ['Card', 'Cash', 'Bank transfer', 'Other'].map((v) => ({
  value: v,
  label: v,
}));
const kindOptions = [
  { value: '', label: 'Choose a kind' },
  ...['Fixed', 'Variable', 'One-off'].map((v) => ({ value: v, label: v })),
];

const dateLabel = computed(() =>
  new Date(date.value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }),
);
const originalLabel = computed(() =>
  'minor' in parsed.value
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.value }).format(
        parsed.value.minor / 100,
      )
    : '',
);

const sheet = ref<HTMLElement | null>(null);
// The opener (the header button) is gone after the route round-trip: land on the month view's own.
async function close() {
  await closeAddExpense(router, route.query);
  await nextTick();
  dialog.restore();
}
const dialog = useDialog(sheet, {
  close,
  fallback: () =>
    document.querySelector<HTMLElement>('[data-mockup="month-view"] [data-testid="add-expense"]'),
});
function submit() {
  submitted.value = true;
  const p = parsed.value;
  if ('error' in p || !category.value) return;
  addExpense({
    date: date.value,
    category: category.value,
    amount: toDefault(p.minor, currency.value),
    // the row is named by its note, then its description
    note: notes.value.trim() || description.value.trim() || category.value,
  });
  close();
}
</script>

<template>
  <div data-mockup-root>
    <div class="ae-backdrop" inert aria-hidden="true">
      <MonthViewMock backdrop />
    </div>
    <div data-mockup="add-expense" class="ae">
      <div class="ae-scrim" @click="close" />
      <Transition name="mk-sheet" appear>
        <section
          ref="sheet"
          class="ae-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ae-title"
          tabindex="-1"
          data-mockup-panel="sheet"
          @keydown="dialog.onKey"
        >
          <header class="ae-head">
            <h1 id="ae-title" class="ae-title">Add expense</h1>
            <button type="button" class="ae-close" aria-label="Close" @click="close">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
            </button>
          </header>

          <form class="ae-form" novalidate @submit.prevent="submit">
            <p v-if="state === 'error'" class="ae-alert" role="alert">
              <span class="mk-lamp mk-lamp--critical" />
              <span>
                <strong>Not saved.</strong> Enter the amount and choose a category, then add it
                again. Nothing you typed was lost.
              </span>
            </p>

            <Input v-model="description" label="Description" />

            <div class="ae-row">
              <Input v-model="amount" label="Amount" variant="amount" :error="amountError" />
              <Select v-model="currency" label="Currency" :options="currencyOptions" />
            </div>

            <p v-if="state === 'loading'" class="ae-preview" role="status">
              Checking the rate for <span class="mk-num">{{ dateLabel }}</span>
            </p>
            <p v-else-if="showPreview" class="ae-preview" role="status">
              <strong class="mk-warn">Rate pending.</strong> No ECB rate for {{ currency }} on
              <span class="mk-num">{{ dateLabel }}</span> yet. Desk saves
              <span class="mk-num">{{ originalLabel }}</span> now and converts it when the rate is
              published.
            </p>

            <Input v-model="date" label="Date" type="date" />

            <div v-if="state === 'loading'" class="ae-skeleton-field" aria-busy="true">
              <span class="mk-label">Category</span>
              <Skeleton height="2.75rem" />
              <span class="mk-sr">Loading categories</span>
            </div>
            <Select
              v-else
              v-model="category"
              label="Category"
              :options="categoryOptions"
              :error="categoryError"
            />

            <div class="ae-row ae-row--even">
              <Select v-model="paidWith" label="Paid with" :options="paidWithOptions" />
              <Select v-model="kind" label="Kind" :options="kindOptions" />
            </div>

            <Input v-model="notes" label="Notes (optional)" />

            <div>
              <Button variant="ghost" size="sm" @click="showRate = !showRate">
                {{ showRate ? 'Hide manual rate' : 'Set manual rate' }}
              </Button>
              <Input
                v-if="showRate"
                class="ae-rate"
                label="Rate override"
                variant="amount"
                placeholder="e.g. 0.7462"
              />
            </div>

            <div class="ae-actions">
              <Button type="submit" :disabled="state === 'loading'">Add expense</Button>
              <Button variant="secondary" @click="close">Cancel</Button>
            </div>
          </form>
        </section>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ae-backdrop {
  pointer-events: none;
}
.ae {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.ae-scrim {
  position: absolute;
  inset: 0;
  /* Board Ink scrim (DESIGN.md §Dialog); a keyword, not a literal colour value. */
  background: color-mix(in srgb, black 45%, transparent);
}
.ae-sheet {
  position: relative;
  max-height: calc(100dvh - var(--space-12));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--color-surface-raised);
  color: var(--color-fg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-overlay);
}
.ae-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}
.ae-title {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
.ae-close {
  display: inline-grid;
  place-items: center;
  width: var(--target-min);
  height: var(--target-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-fg);
  cursor: pointer;
}
.ae-close svg {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
}
.ae-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}
.ae-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem;
  gap: var(--space-3);
  align-items: start;
}
.ae-row--even {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.ae-preview {
  margin: calc(-1 * var(--space-2)) 0 0;
  max-width: 48ch;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  color: var(--color-fg-muted);
}
.ae-alert {
  display: grid;
  grid-template-columns: var(--space-1) minmax(0, 1fr);
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.ae-skeleton-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ae-rate {
  margin-top: var(--space-2);
}
.ae-actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0 calc(-1 * var(--space-4)) calc(-1 * var(--space-4));
  padding: var(--space-3) var(--space-4) var(--space-4);
  background: var(--color-surface-raised);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
}
@media (min-width: 1024px) {
  .ae {
    flex-direction: row;
    justify-content: flex-end;
  }
  .ae-sheet {
    width: 28rem;
    max-height: none;
    height: 100dvh;
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }
  .ae-head {
    padding-block: var(--space-3);
    padding-left: var(--space-6);
  }
  .ae-form {
    padding: var(--space-6);
  }
  .ae-actions {
    display: flex;
    justify-content: flex-start;
    margin: 0 calc(-1 * var(--space-6)) calc(-1 * var(--space-6));
    padding: var(--space-4) var(--space-6);
  }
}
/* The sheet enters from its own edge: the bottom at phone, the right from 1024. */
@media (min-width: 1024px) {
  .mk-sheet-enter-from,
  .mk-sheet-leave-to {
    transform: translateX(100%);
  }
}
</style>
