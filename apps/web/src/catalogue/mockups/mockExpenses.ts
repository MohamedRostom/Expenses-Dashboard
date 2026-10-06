/** T027a: the little shared state behind the month view, add-expense sheet and settings mock-ups:
 * which month is showing, the rows added in this session, the ids removed. Module state on purpose
 * (the mocks are separate routes of one SPA); nothing is stored and no API is called. Money is
 * integer minor units throughout. */
import { computed, ref } from 'vue';
import type { Router } from 'vue-router';
import { months } from '../fixtures-months.js';
import type { FixtureExpense } from '../fixtures.js';

export const monthIndex = ref(1);
export const added = ref<FixtureExpense[]>([]);
export const deleted = ref<string[]>([]);
/** Set by whatever opens the sheet from the board: the sheet then starts blank, not as the demo. */
export const sheetBlank = ref(false);

export const month = computed(() => months[monthIndex.value]!);
export const canPrev = computed(() => monthIndex.value > 0);
export const canNext = computed(() => monthIndex.value < months.length - 1);
export const prevMonth = computed(() => months[monthIndex.value - 1]);
export const nextMonth = computed(() => months[monthIndex.value + 1]);

export function shiftMonth(by: -1 | 1) {
  const next = monthIndex.value + by;
  if (next >= 0 && next < months.length) monthIndex.value = next;
}

export function resetMockExpenses() {
  monthIndex.value = 1;
  added.value = [];
  deleted.value = [];
  sheetBlank.value = false;
  seen.spent = null;
}

/** "12.50" -> 1250. No floats: whole and fraction are read as digits. */
export function parseAmount(input: string): { minor: number } | { error: string } {
  const s = input.trim();
  if (!s) return { error: 'Enter an amount, for example 12.50' };
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) {
    return /^\d+\.\d{3,}$/.test(s)
      ? { error: 'Use at most two decimal places, for example 12.50' }
      : { error: 'Enter an amount in numbers, for example 12.50' };
  }
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return minor > 0 ? { minor } : { error: 'Enter an amount above zero' };
}

// Mock: the last published rate per currency, to turn an entry in another currency into pence.
const RATES: Record<string, number> = { GBP: 1, USD: 0.7462, EUR: 0.8605 };
export const toDefault = (minor: number, currency: string) =>
  Math.round(minor * (RATES[currency] ?? 1));

let seq = 0;
export function addExpense(e: Omit<FixtureExpense, 'id'>): FixtureExpense {
  const row = { ...e, id: `added-${++seq}` };
  added.value = [...added.value, row];
  return row;
}
export const removeExpense = (id: string) => {
  if (!deleted.value.includes(id)) deleted.value = [...deleted.value, id];
};
export const undoRemove = (id: string) => {
  deleted.value = deleted.value.filter((d) => d !== id);
};

/** Open the add-expense sheet from the board, keeping `?live=off` so a paused mock stays paused. */
export function openAddExpense(router: Router, query: Record<string, unknown>) {
  sheetBlank.value = true;
  const live = query['live'];
  return router.push({
    path: '/__ui/mockups/add-expense',
    query: typeof live === 'string' ? { live } : {},
  });
}
export function closeAddExpense(router: Router, query: Record<string, unknown>) {
  const live = query['live'];
  return router.push({
    path: '/__ui/mockups/month-view',
    query: typeof live === 'string' ? { live } : {},
  });
}

/** The last Spent figure the board showed, so a board that remounts after the sheet closes still
 * turns the figure over once if it changed meanwhile (DESIGN.md §Motion: arrival flip). */
export const seen = { spent: null as number | null };
