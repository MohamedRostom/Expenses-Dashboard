import { z } from 'zod';

export const PaidWith = z.enum(['card', 'cash', 'bank_transfer', 'other']);
export type PaidWithT = z.infer<typeof PaidWith>;

export const ExpenseKind = z.enum(['fixed', 'variable', 'one_off']);
export type ExpenseKindT = z.infer<typeof ExpenseKind>;

export const AddedVia = z.enum(['dashboard', 'notion', 'phone', 'import']);
export type AddedViaT = z.infer<typeof AddedVia>;

/** Amount in integer minor units, matching core's Money. Money's own constructor rejects zero
 * (and negative) minor units, so the contract schema matches with `.positive()`. */
export const AmountInput = z.object({
  minor: z.number().int().positive(),
  currency: z.string().length(3),
});
export type AmountInputT = z.infer<typeof AmountInput>;

const MAX_FUTURE_DAYS_MS = 366 * 24 * 60 * 60 * 1000;

/** `date` must not be more than a year in the future (data-model.md future-date rejection). */
function dateNotTooFarInFuture(date: string): boolean {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return true; // format checked elsewhere; don't double-fail
  return parsed.getTime() - Date.now() <= MAX_FUTURE_DAYS_MS;
}

/** POST /expenses */
export const CreateExpenseRequest = z
  .object({
    id: z.string().uuid().optional(),
    description: z.string(),
    amount: AmountInput,
    date: z.string(),
    categoryId: z.string().uuid().nullable(),
    paidWith: PaidWith,
    kind: ExpenseKind,
    notes: z.string().optional(),
  })
  .refine((data) => dateNotTooFarInFuture(data.date), {
    message: 'Expense date must not be more than a year in the future',
    path: ['date'],
  });
export type CreateExpenseRequestT = z.infer<typeof CreateExpenseRequest>;

/** PATCH /expenses/:id */
export const PatchExpenseRequest = z.object({
  description: z.string().optional(),
  amount: AmountInput.optional(),
  date: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  paidWith: PaidWith.optional(),
  kind: ExpenseKind.optional(),
  notes: z.string().nullable().optional(),
  rateOverride: z.object({ rate: z.string() }).nullable().optional(),
});
export type PatchExpenseRequestT = z.infer<typeof PatchExpenseRequest>;

export const ExpenseResponse = z.object({
  id: z.string(),
  description: z.string(),
  date: z.string(),
  categoryId: z.string().nullable(),
  paidWith: PaidWith,
  kind: ExpenseKind,
  notes: z.string().nullable(),
  amountOriginal: z.number().int(),
  currencyOriginal: z.string(),
  rateToDefault: z.string().nullable(),
  rateDate: z.string().nullable(),
  rateSource: z.string().nullable(),
  amountDefault: z.number().int().nullable(),
  rateOverridden: z.boolean(),
  addedVia: AddedVia,
  notionPageId: z.string().nullable().optional(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExpenseResponseT = z.infer<typeof ExpenseResponse>;

/** GET /expenses query */
export const ListExpensesQuery = z.object({
  month: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().uuid().optional(),
  includeDeleted: z.boolean().optional(),
  cursor: z.string().optional(),
});
export type ListExpensesQueryT = z.infer<typeof ListExpensesQuery>;

export const CategorySpend = z.object({
  categoryId: z.string(),
  spent: z.number().int(),
  budget: z.number().int().nullable(),
  overBudget: z.boolean(),
});
export type CategorySpendT = z.infer<typeof CategorySpend>;

export const MonthSummary = z.object({
  month: z.string(),
  currency: z.string(),
  spent: z.number().int(),
  budgeted: z.number().int(),
  remaining: z.number().int(),
  byCategory: z.array(CategorySpend),
  pendingRates: z.number().int(),
});
export type MonthSummaryT = z.infer<typeof MonthSummary>;

/** GET /expenses response */
export const ListExpensesResponse = z.object({
  expenses: z.array(ExpenseResponse),
  summary: MonthSummary,
  nextCursor: z.string().nullable().optional(),
});
export type ListExpensesResponseT = z.infer<typeof ListExpensesResponse>;

/** GET /summary/year response */
export const YearSummary = z.object({
  year: z.string(),
  currency: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      spent: z.number().int(),
      budgeted: z.number().int(),
    }),
  ),
});
export type YearSummaryT = z.infer<typeof YearSummary>;
