import { defineStore } from 'pinia';
import type {
  CreateExpenseRequestT,
  ExpenseResponseT,
  MonthSummaryT,
  PatchExpenseRequestT,
} from '@desk/contracts';
import { apiFetch, ApiError } from '../api/client.js';
import { useToast } from '@desk/ui';

/** YYYY-MM for the current month, in the viewer's local time. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch<{ expenses: ExpenseResponseT[]; summary: MonthSummaryT }>(
          `/expenses?month=${encodeURIComponent(this.currentMonth)}`,
        );
        this.expenses = res.expenses;
        this.summary = res.summary;
      } catch (err) {
        this.error = err instanceof ApiError ? err.code : String(err);
      } finally {
        this.loading = false;
      }
    },

    /** Optimistic create: id is generated client-side (uuid v4 — see ponytail note
     * below) so the row appears immediately; rolled back with an undo toast on
     * failure, and offered an "Undo" action on success (delete-within-a-few-seconds). */
    async create(input: Omit<CreateExpenseRequestT, 'id'>) {
      // ponytail: crypto.randomUUID() gives v4, not v7. Spec wants v7 for
      // cursor time-ordering; no `uuid` dependency exists anywhere in the repo
      // (API itself uses crypto.randomUUID() v4 — see apps/api/src/services/expenses.ts),
      // so add v7 only if cursor ordering becomes a real problem.
      const id = crypto.randomUUID();
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
