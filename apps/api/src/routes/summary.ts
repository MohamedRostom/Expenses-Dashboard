import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  monthSummary,
  yearSummary,
  forecast,
  compareMonths,
  type CategoryRow,
  type ExpenseRow,
} from '@desk/core';
import { categories, expenses, type Db } from '@desk/db';
import type { MonthSummaryT, YearSummaryT } from '@desk/contracts';
import type { AppVariables } from '../app.js';
import type { Clock } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

/** GET /summary/month, GET /summary/year, GET /summary/category/:id, GET /summary/forecast,
 * GET /summary/compare. */
export function createSummaryRoutes(db: Db, clock: Clock) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/summary/month', async (c) => {
    const user = requireAuth(c);
    const month = c.req.query('month');
    if (!month || !MONTH_RE.test(month)) {
      throw new ApiError('validation_failed', 'month must be YYYY-MM', 400);
    }

    const [expenseRows, categoryRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, user.id)),
      db.select().from(categories).where(eq(categories.userId, user.id)),
    ]);

    const result = monthSummary(
      expenseRows.map(toExpenseRow),
      categoryRows.map(toCategoryRow),
      month,
    );

    const body: MonthSummaryT = {
      month,
      currency: user.defaultCurrency,
      spent: result.tiles.spent,
      budgeted: result.tiles.budget,
      remaining: result.tiles.remaining,
      byCategory: result.categories.map((cs) => ({
        categoryId: cs.id,
        spent: cs.spent,
        budget: cs.budget,
        overBudget: cs.overBudget,
      })),
      pendingRates: result.pendingCount,
    };
    return c.json(body);
  });

  app.get('/summary/year', async (c) => {
    const user = requireAuth(c);
    const year = c.req.query('year');
    if (!year || !YEAR_RE.test(year)) {
      throw new ApiError('validation_failed', 'year must be YYYY', 400);
    }

    const [expenseRows, categoryRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, user.id)),
      db.select().from(categories).where(eq(categories.userId, user.id)),
    ]);

    const result = yearSummary(
      expenseRows.map(toExpenseRow),
      categoryRows.map(toCategoryRow),
      year,
    );

    const body: YearSummaryT = {
      year,
      currency: user.defaultCurrency,
      months: result.months,
    };
    return c.json(body);
  });

  app.get('/summary/category/:id', async (c) => {
    const user = requireAuth(c);
    const categoryId = c.req.param('id');
    const monthsParam = c.req.query('months');
    const monthCount = monthsParam ? Math.max(1, Math.min(24, Number(monthsParam))) : 12;

    const [categoryRow] = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (!categoryRow || categoryRow.userId !== user.id) {
      throw new ApiError('not_found', 'Category not found', 404);
    }

    const [expenseRows, categoryRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, user.id)),
      db.select().from(categories).where(eq(categories.userId, user.id)),
    ]);
    const expenseRowsMapped = expenseRows.map(toExpenseRow);
    const categoryRowsMapped = categoryRows.map(toCategoryRow);

    const months = monthsBackFrom(clock.now(), monthCount).map((month) => {
      const { categories: cats } = monthSummary(expenseRowsMapped, categoryRowsMapped, month);
      const own = cats.find((cs) => cs.id === categoryId);
      return { month, spent: own?.spent ?? 0, budget: own?.budget ?? categoryRow.budgetMinor };
    });

    return c.json({ categoryId, months });
  });

  app.get('/summary/forecast', async (c) => {
    const user = requireAuth(c);
    const now = clock.now();
    const month = c.req.query('month') ?? monthKey(now);
    if (!MONTH_RE.test(month)) {
      throw new ApiError('validation_failed', 'month must be YYYY-MM', 400);
    }

    const [expenseRows, categoryRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, user.id)),
      db.select().from(categories).where(eq(categories.userId, user.id)),
    ]);

    const { spentToDate, variableSpendSoFar, fixedSpendByCategory } = splitByKind(
      expenseRows,
      month,
    );

    const fixedBudgetsRemaining = categoryRows.reduce((acc, cat) => {
      if (cat.defaultKind !== 'fixed' || cat.budgetMinor == null) return acc;
      const already = fixedSpendByCategory.get(cat.id) ?? 0;
      return acc + Math.max(0, cat.budgetMinor - already);
    }, 0);

    const { daysElapsed, daysInMonth } = monthProgress(month, now);
    const result = forecast(
      spentToDate,
      fixedBudgetsRemaining,
      variableSpendSoFar,
      daysElapsed,
      daysInMonth,
    );

    return c.json({
      month,
      currency: user.defaultCurrency,
      spentToDate,
      committedFixed: fixedBudgetsRemaining,
      forecast: Math.round(result.total),
      basis: result.basis,
    });
  });

  app.get('/summary/compare', async (c) => {
    const user = requireAuth(c);
    const a = c.req.query('a');
    const b = c.req.query('b');
    if (!a || !MONTH_RE.test(a) || !b || !MONTH_RE.test(b)) {
      throw new ApiError('validation_failed', 'a and b must be YYYY-MM', 400);
    }

    const [expenseRows, categoryRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, user.id)),
      db.select().from(categories).where(eq(categories.userId, user.id)),
    ]);
    const expenseRowsMapped = expenseRows.map(toExpenseRow);
    const categoryRowsMapped = categoryRows.map(toCategoryRow);

    const summaryA = monthSummary(expenseRowsMapped, categoryRowsMapped, a);
    const summaryB = monthSummary(expenseRowsMapped, categoryRowsMapped, b);

    const result = compareMonths(
      {
        spent: summaryA.tiles.spent,
        byCategory: summaryA.categories.map((cs) => ({ id: cs.id, spent: cs.spent })),
      },
      {
        spent: summaryB.tiles.spent,
        byCategory: summaryB.categories.map((cs) => ({ id: cs.id, spent: cs.spent })),
      },
    );

    const aById = new Map(summaryA.categories.map((cs) => [cs.id, cs.spent]));
    const bById = new Map(summaryB.categories.map((cs) => [cs.id, cs.spent]));

    const byCategory = result.byCategory.map((row) => ({
      categoryId: row.id,
      a: aById.get(row.id) ?? 0,
      b: bById.get(row.id) ?? 0,
      delta: row.deltaMinor,
    }));

    return c.json({ a, b, byCategory });
  });

  return app;
}

function toExpenseRow(row: typeof expenses.$inferSelect): ExpenseRow {
  return {
    categoryId: row.categoryId,
    expenseDate: row.expenseDate,
    amountDefault: row.amountDefault,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toCategoryRow(row: typeof categories.$inferSelect): CategoryRow {
  return { id: row.id, budgetMinor: row.budgetMinor };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `count` months ending at `from`'s month, oldest first. */
function monthsBackFrom(from: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

/** Days elapsed / days in the requested month, relative to `now`: the current day-of-month for
 * the current month, the full month for a past month, zero elapsed for a future month. */
function monthProgress(month: string, now: Date): { daysElapsed: number; daysInMonth: number } {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
  const currentMonth = monthKey(now);
  if (month === currentMonth) {
    return { daysElapsed: now.getUTCDate(), daysInMonth };
  }
  if (month < currentMonth) {
    return { daysElapsed: daysInMonth, daysInMonth };
  }
  return { daysElapsed: 0, daysInMonth };
}

/** Splits this month's spend into spend-to-date (all kinds), variable-kind spend, and
 * fixed-kind spend already incurred per category (for forecast's "not yet incurred" clamp). */
function splitByKind(
  rows: (typeof expenses.$inferSelect)[],
  month: string,
): { spentToDate: number; variableSpendSoFar: number; fixedSpendByCategory: Map<string, number> } {
  let spentToDate = 0;
  let variableSpendSoFar = 0;
  const fixedSpendByCategory = new Map<string, number>();

  for (const row of rows) {
    if (!row.expenseDate.startsWith(month)) continue;
    if (row.deletedAt !== null) continue;
    if (row.amountDefault === null) continue;

    spentToDate += row.amountDefault;
    if (row.kind === 'variable') {
      variableSpendSoFar += row.amountDefault;
    } else if (row.kind === 'fixed' && row.categoryId !== null) {
      fixedSpendByCategory.set(
        row.categoryId,
        (fixedSpendByCategory.get(row.categoryId) ?? 0) + row.amountDefault,
      );
    }
  }

  return { spentToDate, variableSpendSoFar, fixedSpendByCategory };
}
