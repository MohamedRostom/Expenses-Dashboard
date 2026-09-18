import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { monthSummary, yearSummary, type CategoryRow, type ExpenseRow } from '@desk/core';
import { categories, expenses, type Db } from '@desk/db';
import type { MonthSummaryT, YearSummaryT } from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

/** GET /summary/month, GET /summary/year. */
export function createSummaryRoutes(db: Db) {
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
