import { z } from 'zod';

/** Error codes the API returns in the envelope below. Foreign-owned resources always answer
 * `not_found`, never a forbidden-style code (see contracts/api.md). */
export const ErrorCode = z.enum([
  'validation_failed',
  'unauthenticated',
  'not_found',
  'rate_limited',
  'conflict',
  'rate_unavailable',
]);
export type ErrorCodeT = z.infer<typeof ErrorCode>;

/** Shape of every non-2xx JSON response across the API. */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelopeT = z.infer<typeof ErrorEnvelope>;
