import { defineStore } from 'pinia';
import type {
  CreateExpenseRequestT,
  ExpenseResponseT,
  MonthSummaryT,
  PatchExpenseRequestT,
} from '@desk/contracts';
import { apiFetch, ApiError } from '../api/client.js';
import { useToast } from '@desk/ui';
import { uuidv7 } from '../offline/uuid.js';

/** YYYY-MM for the current month, in the viewer's local time. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

let loadMonthSeq = 0;

export const useExpensesStore = defineStore('expenses', {
  state: () => ({
    expenses: [] as ExpenseResponseT[],
    summary: null as MonthSummaryT | null,
    currentMonth: currentMonth(),
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async loadMonth(month?: string) {
      if (month) this.currentMonth = month;
      // Request sequencing: rapid prev/next clicks fire overlapping loads, and a slower earlier
      // response resolving after a faster later one would otherwise overwrite the current
      // month's data with a different month's — only the most recently *started* call may
      // apply its result.
      const seq = ++loadMonthSeq;
      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch<{ expenses: ExpenseResponseT[]; summary: MonthSummaryT }>(
          `/expenses?month=${encodeURIComponent(this.currentMonth)}`,
        );
        if (seq !== loadMonthSeq) return;
        this.expenses = res.expenses;
        this.summary = res.summary;
      } catch (err) {
        if (seq !== loadMonthSeq) return;
        this.error = err instanceof ApiError ? err.code : String(err);
      } finally {
        if (seq === loadMonthSeq) this.loading = false;
      }
    },

    /** Optimistic create: id is generated client-side (uuid v7, time-ordered — same
     * generator the offline queue uses, apps/web/src/offline/uuid.ts) so the row appears
     * immediately; rolled back with an undo toast on failure, and offered an "Undo" action
     * on success (delete-within-a-few-seconds). */
    async create(input: Omit<CreateExpenseRequestT, 'id'>) {
      const id = uuidv7();
      const optimistic: ExpenseResponseT = {
        id,
        description: input.description,
        date: input.date,
        categoryId: input.categoryId,
        paidWith: input.paidWith,
        kind: input.kind,
        notes: input.notes ?? null,
        amountOriginal: input.amount.minor,
        currencyOriginal: input.amount.currency,
        rateToDefault: null,
        rateDate: null,
        rateSource: null,
        amountDefault: null,
        rateOverridden: false,
        addedVia: 'dashboard',
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.expenses = [optimistic, ...this.expenses];

      const toast = useToast();
      try {
        const res = await apiFetch<{ expense: ExpenseResponseT }>('/expenses', {
          method: 'POST',
          body: JSON.stringify({ ...input, id }),
        });
        const i = this.expenses.findIndex((e) => e.id === id);
        if (i !== -1) this.expenses[i] = res.expense;
        void this.loadMonth();
        const toastId = toast.push('Expense added', 'info', 6000);
        // ponytail: real undo action wiring belongs to the Toast component's
        // click handler; expose the remove() call here for MonthView/ExpenseForm
        // to bind an "Undo" button to for this toastId.
        return { expense: res.expense, toastId, undo: () => this.remove(res.expense.id) };
      } catch (err) {
        this.expenses = this.expenses.filter((e) => e.id !== id);
        toast.push('Could not save expense — please retry', 'critical');
        throw err;
      }
    },

    async update(id: string, patch: PatchExpenseRequestT) {
      const res = await apiFetch<{ expense: ExpenseResponseT }>(`/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const i = this.expenses.findIndex((e) => e.id === id);
      if (i !== -1) this.expenses[i] = res.expense;
      return res.expense;
    },

    /** Soft delete — used both by "delete" in MonthView and by the create-undo toast. */
    async remove(id: string) {
      await apiFetch<void>(`/expenses/${id}`, { method: 'DELETE' });
      this.expenses = this.expenses.filter((e) => e.id !== id);
    },

    async restore(id: string) {
      const res = await apiFetch<{ expense: ExpenseResponseT }>(`/expenses/${id}/restore`, {
        method: 'POST',
      });
      return res.expense;
    },
  },
});
