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
  'internal',
  'email_unverified',
  'limit_reached',
  'verification_failed',
  'host_not_allowed',
  'scope_denied',
  'account_mismatch',
]);
export type ErrorCodeT = z.infer<typeof ErrorCode>;

/** Error codes stored in account.lastError (panel-specific per-account errors). */
export const AccountErrorCode = z.enum([
  'provider_unreachable',
  'access_revoked',
  'rate_limited',
  'login_failed',
  'host_not_allowed',
]);
export type AccountErrorCodeT = z.infer<typeof AccountErrorCode>;

/** Shape of every non-2xx JSON response across the API. */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelopeT = z.infer<typeof ErrorEnvelope>;
