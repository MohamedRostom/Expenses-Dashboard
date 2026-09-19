import { and, desc, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import { expenses as expensesTable, categories as categoriesTable, type Db } from '@desk/db';
import { convert, monthSummary, uuidv7 } from '@desk/core';
import type {
  CreateExpenseRequestT,
  PatchExpenseRequestT,
  ExpenseResponseT,
  ListExpensesQueryT,
  ListExpensesResponseT,
  MonthSummaryT,
} from '@desk/contracts';
import type { RatesService } from './rates.js';
import { ApiError } from '../lib/api-error.js';

const PAGE_SIZE = 500;
/** research.md R6: frankfurter only ever answers with a prior published date. A later date, or
 * one more than a week before the requested date, is an anomaly — treated as `unsupported` so
 * the expense saves with amountDefault left NULL rather than trusting a stale/bogus answer. */
const MAX_RATE_DATE_GAP_DAYS = 7;

type ExpenseRow = typeof expensesTable.$inferSelect;
type ExpenseInsert = typeof expensesTable.$inferInsert;

export type Clock = { now(): Date };

function toResponse(row: ExpenseRow): ExpenseResponseT {
  return {
    id: row.id,
    description: row.description,
    date: row.expenseDate,
    categoryId: row.categoryId,
    paidWith: row.paidWith as ExpenseResponseT['paidWith'],
    kind: row.kind as ExpenseResponseT['kind'],
    notes: row.notes,
    amountOriginal: row.amountOriginal,
    currencyOriginal: row.currencyOriginal,
    rateToDefault: row.rateToDefault,
    rateDate: row.rateDate,
    rateSource: row.rateSource,
    amountDefault: row.amountDefault,
    rateOverridden: row.rateOverridden,
    addedVia: row.addedVia as ExpenseResponseT['addedVia'],
    notionPageId: row.notionPageId,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/** First day of the month *after* `month` ("YYYY-MM"), for a half-open date range. */
function nextMonthStart(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year as number, mon as number, 1)).toISOString().slice(0, 10);
}

type Conversion = {
  amountDefault: number | null;
  rateToDefault: string | null;
  rateDate: string | null;
  rateSource: string | null;
};

/** Fetches a rate and decides whether it's trustworthy enough to apply; leaves the expense
 * pending (all fields null) on `unsupported` or an anomalous answer. */
async function resolveConversion(
  rates: RatesService,
  expenseDate: string,
  amountMinor: number,
  currency: string,
  defaultCurrency: string,
): Promise<Conversion> {
  const outcome = await rates.getRate(expenseDate, currency, defaultCurrency);
  if ('unsupported' in outcome) {
    return { amountDefault: null, rateToDefault: null, rateDate: null, rateSource: null };
  }
  if (
    outcome.rateDate > expenseDate ||
    daysBetween(outcome.rateDate, expenseDate) > MAX_RATE_DATE_GAP_DAYS
  ) {
    return { amountDefault: null, rateToDefault: null, rateDate: null, rateSource: null };
  }
  const converted = convert({ minor: amountMinor, currency }, outcome.rate, defaultCurrency);
  return {
    amountDefault: converted.minor,
    rateToDefault: outcome.rate,
    rateDate: outcome.rateDate,
    rateSource: outcome.source,
  };
}

/** Only-uuid-validated categoryId lets user A attach user B's category id to their own expense
 * (the row still saves fine — categoryId has no FK to a specific user). Confirms the category
 * belongs to `userId` before it's ever written; `null` (no category) always passes. */
async function assertOwnedCategory(
  db: Db,
  userId: string,
  categoryId: string | null,
): Promise<void> {
  if (categoryId === null) return;
  const [row] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError('not_found', 'Category not found', 404);
}

export function createExpensesService(db: Db, rates: RatesService, clock: Clock) {
  async function findOwned(userId: string, id: string): Promise<ExpenseRow> {
    const [row] = await db.select().from(expensesTable).where(eq(expensesTable.id, id)).limit(1);
    if (!row || row.userId !== userId) throw new ApiError('not_found', 'Expense not found', 404);
    return row;
  }

  async function create(
    userId: string,
    defaultCurrency: string,
    input: CreateExpenseRequestT,
    addedVia: ExpenseResponseT['addedVia'] = 'dashboard',
  ): Promise<{ expense: ExpenseResponseT; created: boolean }> {
    // Server-generated ids must also be v7 (time-ordered), not v4 — list()'s pagination cursor
    // sorts by id descending as a proxy for creation order (research.md R13).
    const id = input.id ?? uuidv7();

    // Idempotent create (research.md R13): if this id already exists, return it as-is rather
    // than re-inserting or re-fetching a rate.
    const [existing] = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.id, id))
      .limit(1);
    if (existing) {
      if (existing.userId !== userId) throw new ApiError('not_found', 'Expense not found', 404);
      return { expense: toResponse(existing), created: false };
    }

    await assertOwnedCategory(db, userId, input.categoryId);

    const conv = await resolveConversion(
      rates,
      input.date,
      input.amount.minor,
      input.amount.currency,
      defaultCurrency,
    );

    const values: ExpenseInsert = {
      id,
      userId,
      categoryId: input.categoryId,
      description: input.description,
      expenseDate: input.date,
      paidWith: input.paidWith,
      kind: input.kind,
      notes: input.notes ?? null,
      amountOriginal: input.amount.minor,
      currencyOriginal: input.amount.currency,
      rateToDefault: conv.rateToDefault,
      rateDate: conv.rateDate,
      rateSource: conv.rateSource,
      amountDefault: conv.amountDefault,
      addedVia,
    };
    await db.insert(expensesTable).values(values).onConflictDoNothing();

    const [row] = await db.select().from(expensesTable).where(eq(expensesTable.id, id)).limit(1);
    if (!row) throw new Error('create: row missing after insert');
    // A concurrent insert by a different user for the same client-generated id lost the race.
    if (row.userId !== userId) throw new ApiError('not_found', 'Expense not found', 404);
    return { expense: toResponse(row), created: true };
  }

  async function list(
    userId: string,
    defaultCurrency: string,
    query: ListExpensesQueryT,
  ): Promise<ListExpensesResponseT> {
    const conditions = [eq(expensesTable.userId, userId)];
    if (!query.includeDeleted) conditions.push(isNull(expensesTable.deletedAt));
    if (query.category) conditions.push(eq(expensesTable.categoryId, query.category));

    const month = query.month ?? monthKeyOf(clock.now().toISOString());
    const monthStart = `${month}-01`;
    const monthEnd = nextMonthStart(month);

    if (query.month) {
      conditions.push(gte(expensesTable.expenseDate, monthStart));
      conditions.push(lt(expensesTable.expenseDate, monthEnd));
    } else {
      if (query.from) conditions.push(gte(expensesTable.expenseDate, query.from));
      if (query.to) conditions.push(lte(expensesTable.expenseDate, query.to));
    }
    if (query.cursor) conditions.push(lt(expensesTable.id, query.cursor));

    const rows = await db
      .select()
      .from(expensesTable)
      .where(and(...conditions))
      .orderBy(desc(expensesTable.id))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const nextCursor = rows.length > PAGE_SIZE ? (page[page.length - 1] as ExpenseRow).id : null;

    // Summary always covers the *whole* month, independent of the page window or filters above.
    const summaryRows = await db
      .select()
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.userId, userId),
          gte(expensesTable.expenseDate, monthStart),
          lt(expensesTable.expenseDate, monthEnd),
        ),
      );
    const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId));

    const rollup = monthSummary(
      summaryRows.map((r) => ({
        categoryId: r.categoryId,
        expenseDate: r.expenseDate,
        amountDefault: r.amountDefault,
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      })),
      cats.map((c) => ({ id: c.id, budgetMinor: c.budgetMinor })),
      month,
    );
    const summary: MonthSummaryT = {
      month,
      currency: defaultCurrency,
      spent: rollup.tiles.spent,
      budgeted: rollup.tiles.budget,
      remaining: rollup.tiles.remaining,
      byCategory: rollup.categories.map((c) => ({
        categoryId: c.id,
        spent: c.spent,
        budget: c.budget,
        overBudget: c.overBudget,
      })),
      pendingRates: rollup.pendingCount,
    };

    return { expenses: page.map(toResponse), summary, nextCursor };
  }

  async function patch(
    userId: string,
    defaultCurrency: string,
    id: string,
    input: PatchExpenseRequestT,
  ): Promise<ExpenseResponseT> {
    const existing = await findOwned(userId, id);

    const nextDate = input.date ?? existing.expenseDate;
    const nextAmount = input.amount?.minor ?? existing.amountOriginal;
    const nextCurrency = input.amount?.currency ?? existing.currencyOriginal;
    const currencyOrDateChanged = input.amount !== undefined || input.date !== undefined;

    if (input.categoryId !== undefined) await assertOwnedCategory(db, userId, input.categoryId);

    const patchFields: Partial<ExpenseInsert> = { updatedAt: clock.now() };
    if (input.description !== undefined) patchFields.description = input.description;
    if (input.categoryId !== undefined) patchFields.categoryId = input.categoryId;
    if (input.paidWith !== undefined) patchFields.paidWith = input.paidWith;
    if (input.kind !== undefined) patchFields.kind = input.kind;
    if (input.notes !== undefined) patchFields.notes = input.notes;
    if (input.amount !== undefined) {
      patchFields.amountOriginal = input.amount.minor;
      patchFields.currencyOriginal = input.amount.currency;
    }
    if (input.date !== undefined) patchFields.expenseDate = input.date;

    if (input.rateOverride !== undefined) {
      if (input.rateOverride === null) {
        // Clear the override: re-derive via the rates service (same as create), which hits the
        // fx_rates cache and returns the originally fetched rate — nothing bespoke to restore.
        const conv = await resolveConversion(
          rates,
          nextDate,
          nextAmount,
          nextCurrency,
          defaultCurrency,
        );
        patchFields.rateOverridden = false;
        patchFields.amountDefault = conv.amountDefault;
        patchFields.rateToDefault = conv.rateToDefault;
        patchFields.rateDate = conv.rateDate;
        patchFields.rateSource = conv.rateSource;
      } else {
        const converted = convert(
          { minor: nextAmount, currency: nextCurrency },
          input.rateOverride.rate,
          defaultCurrency,
        );
        patchFields.rateOverridden = true;
        patchFields.rateSource = 'user';
        patchFields.rateToDefault = input.rateOverride.rate;
        patchFields.rateDate = nextDate;
        patchFields.amountDefault = converted.minor;
      }
    } else if (currencyOrDateChanged) {
      if (existing.rateOverridden && existing.rateToDefault) {
        // Still overridden: keep the user's rate, just re-apply it to the new amount/currency.
        const converted = convert(
          { minor: nextAmount, currency: nextCurrency },
          existing.rateToDefault,
          defaultCurrency,
        );
        patchFields.amountDefault = converted.minor;
      } else {
        const conv = await resolveConversion(
          rates,
          nextDate,
          nextAmount,
          nextCurrency,
          defaultCurrency,
        );
        patchFields.amountDefault = conv.amountDefault;
        patchFields.rateToDefault = conv.rateToDefault;
        patchFields.rateDate = conv.rateDate;
        patchFields.rateSource = conv.rateSource;
      }
    }

    const [row] = await db
      .update(expensesTable)
      .set(patchFields)
      .where(eq(expensesTable.id, id))
      .returning();
    return toResponse(row as ExpenseRow);
  }

  async function remove(userId: string, id: string): Promise<void> {
    await findOwned(userId, id);
    await db.update(expensesTable).set({ deletedAt: clock.now() }).where(eq(expensesTable.id, id));
  }

  async function restore(userId: string, id: string): Promise<ExpenseResponseT> {
    await findOwned(userId, id);
    const [row] = await db
      .update(expensesTable)
      .set({ deletedAt: null })
      .where(eq(expensesTable.id, id))
      .returning();
    return toResponse(row as ExpenseRow);
  }

  return { create, list, patch, remove, restore };
}

export type ExpensesService = ReturnType<typeof createExpensesService>;
