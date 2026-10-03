import type { ZodType } from 'zod';
import { ApiError } from './api-error.js';

/** contracts/api.md: bad widget/place input is 422, not the app-wide 400 for ZodError. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const details = Object.fromEntries(
    r.error.issues.map((i) => [i.path.join('.') || '(root)', i.message]),
  );
  throw new ApiError('validation_failed', 'Validation failed', 422, details);
}
