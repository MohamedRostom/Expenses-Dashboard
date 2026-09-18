import { z } from 'zod';

export const CategoryKind = z.enum(['fixed', 'variable', 'one_off']);
export type CategoryKindT = z.infer<typeof CategoryKind>;

/** POST /categories */
export const CreateCategoryRequest = z.object({
  name: z.string().min(1),
  colour: z.string().min(1),
  defaultKind: CategoryKind.nullable().optional(),
  budgetMinor: z.number().int().positive().nullable().optional(),
});
export type CreateCategoryRequestT = z.infer<typeof CreateCategoryRequest>;

/** PATCH /categories/:id */
export const PatchCategoryRequest = z.object({
  name: z.string().min(1).optional(),
  colour: z.string().min(1).optional(),
  defaultKind: CategoryKind.nullable().optional(),
  budgetMinor: z.number().int().positive().nullable().optional(),
  archived: z.boolean().optional(),
});
export type PatchCategoryRequestT = z.infer<typeof PatchCategoryRequest>;

export const CategoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string(),
  defaultKind: CategoryKind.nullable(),
  budgetMinor: z.number().int().nullable(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CategoryResponseT = z.infer<typeof CategoryResponse>;

export const ListCategoriesResponse = z.object({
  categories: z.array(CategoryResponse),
});
export type ListCategoriesResponseT = z.infer<typeof ListCategoriesResponse>;
