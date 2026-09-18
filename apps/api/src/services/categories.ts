import { and, eq } from 'drizzle-orm';
import { DEFAULT_CATEGORIES } from '@desk/core';
import { categories as categoriesTable, expenses as expensesTable, type Db } from '@desk/db';
import type {
  CategoryResponseT,
  CreateCategoryRequestT,
  PatchCategoryRequestT,
} from '@desk/contracts';
import { ApiError } from '../lib/api-error.js';

type CategoryRow = typeof categoriesTable.$inferSelect;

const OTHER_NAME = 'Other';
/** ponytail: fixed palette cycled by sort order — no colour picker needed for the seed. */
const SEED_COLOURS = [
  '#a83a2e',
  '#a8641a',
  '#8a7a1f',
  '#5c8a1f',
  '#1f6e5a',
  '#1f6e8a',
  '#1f4a8a',
  '#4a1f8a',
  '#7a1f8a',
  '#8a1f5c',
];

function toResponse(row: CategoryRow): CategoryResponseT {
  return {
    id: row.id,
    name: row.name,
    colour: row.colour,
    defaultKind: row.defaultKind as CategoryResponseT['defaultKind'],
    budgetMinor: row.budgetMinor,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Idempotent: does nothing if the user already has categories (e.g. re-run on a retried
 * sign-up). Called from register() and the Google new-user branch. */
export async function seedDefaultCategories(db: Db, userId: string): Promise<void> {
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(categoriesTable).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      userId,
      name: c.name,
      colour: SEED_COLOURS[i % SEED_COLOURS.length] as string,
      defaultKind: c.defaultKind,
      sortOrder: i,
    })),
  );
}

export function createCategoriesService(db: Db) {
  async function findOwned(userId: string, id: string): Promise<CategoryRow> {
    const [row] = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, id), eq(categoriesTable.userId, userId)))
      .limit(1);
    if (!row) throw new ApiError('not_found', 'Category not found', 404);
    return row;
  }

  return {
    /** `includeArchived` defaults to true — archived categories keep their historical spend in
     * month summaries, so callers building a summary pass the full list; the "active" picker
     * lists filter client-side on `archivedAt`. */
    async list(userId: string): Promise<CategoryResponseT[]> {
      const rows = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.userId, userId));
      return rows.sort((a, b) => a.sortOrder - b.sortOrder).map(toResponse);
    },

    async create(userId: string, input: CreateCategoryRequestT): Promise<CategoryResponseT> {
      const [row] = await db
        .insert(categoriesTable)
        .values({
          userId,
          name: input.name,
          colour: input.colour,
          defaultKind: input.defaultKind ?? null,
          budgetMinor: input.budgetMinor ?? null,
          sortOrder: 999,
        })
        .returning();
      if (!row) throw new Error('categories.create: insert returned no row');
      return toResponse(row);
    },

    async patch(
      userId: string,
      id: string,
      input: PatchCategoryRequestT,
    ): Promise<CategoryResponseT> {
      const current = await findOwned(userId, id);
      const { archived, ...rest } = input;
      const archivedAt = archived === undefined ? undefined : archived ? new Date() : null;

      const [row] = await db
        .update(categoriesTable)
        .set({
          ...rest,
          ...(archivedAt !== undefined ? { archivedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(categoriesTable.id, current.id))
        .returning();
      if (!row) throw new Error('categories.patch: update returned no row');
      return toResponse(row);
    },

    /** Reassigns the category's expenses to "Other" (creating it if somehow missing), then
     * deletes the row. Refuses to delete "Other" itself. */
    async remove(userId: string, id: string): Promise<void> {
      const target = await findOwned(userId, id);
      if (target.name === OTHER_NAME) {
        throw new ApiError('conflict', 'The "Other" category cannot be deleted', 409);
      }

      let [other] = await db
        .select()
        .from(categoriesTable)
        .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.name, OTHER_NAME)))
        .limit(1);
      if (!other) {
        [other] = await db
          .insert(categoriesTable)
          .values({ userId, name: OTHER_NAME, colour: '#8a1f5c', sortOrder: 999 })
          .returning();
      }
      if (!other) throw new Error('categories.remove: could not find or create "Other"');

      await db
        .update(expensesTable)
        .set({ categoryId: other.id, updatedAt: new Date() })
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.categoryId, target.id)));

      await db.delete(categoriesTable).where(eq(categoriesTable.id, target.id));
    },
  };
}
