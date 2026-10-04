import type { ZodType } from 'zod';
import { ApiError } from './api-error.js';

/** contracts/api.md: bad widget/place input is 422, not the app-wide 400 for ZodError. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw validationError(
    r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export function validationError(
  issues: readonly { path: string; message: string }[],
  message = 'Validation failed',
): ApiError {
  const details = Object.fromEntries(issues.map((i) => [i.path || '(root)', i.message]));
  return new ApiError('validation_failed', message, 422, details);
}
