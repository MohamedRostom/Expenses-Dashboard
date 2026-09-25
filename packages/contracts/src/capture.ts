import { z } from 'zod';
import { PaidWith } from './expenses.js';

/** POST /hooks/generic/:token body (contracts/generic-webhook.md). `amount` as string or
 * number is parsed against the resolved currency's exponent in the service, not here. */
export const GenericWebhookBody = z.object({
  // Deliberately allows a negative amount (test/hooks.test.ts: "negative amount is a valid
  // refund") — unlike AmountInput (expenses.ts), which is .positive() for the dashboard's own
  // add-expense form. Only zero is invalid, rejected by core's Money() in the service.
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3),
  description: z.string().min(1).max(200),
  date: z.string().optional(),
  category: z.string().optional(),
  paidWith: PaidWith.optional(),
  id: z.string().min(1).max(128).optional(),
});
export type GenericWebhookBodyT = z.infer<typeof GenericWebhookBody>;

export const GenericWebhookResponse = z.object({
  expenseId: z.string(),
  duplicate: z.boolean(),
});
export type GenericWebhookResponseT = z.infer<typeof GenericWebhookResponse>;

/** GET /capture/tokens item — never carries the secret. */
export const CaptureTokenSummary = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type CaptureTokenSummaryT = z.infer<typeof CaptureTokenSummary>;

export const ListCaptureTokensResponse = z.object({ tokens: z.array(CaptureTokenSummary) });
export type ListCaptureTokensResponseT = z.infer<typeof ListCaptureTokensResponse>;

/** POST /capture/tokens/:label/rotate response — the only time the plaintext token/URL appears. */
export const RotateCaptureTokenResponse = z.object({
  token: CaptureTokenSummary,
  secret: z.string(),
  url: z.string(),
});
export type RotateCaptureTokenResponseT = z.infer<typeof RotateCaptureTokenResponse>;

export const CaptureMappingEntry = z.object({
  label: z.string().min(1),
  categoryId: z.string().uuid(),
});
export type CaptureMappingEntryT = z.infer<typeof CaptureMappingEntry>;

export const CaptureMappingResponse = z.object({
  mappings: z.array(CaptureMappingEntry),
  /** Labels seen on incoming captures that have no mapping row (rendered "unmapped" in Settings). */
  unmappedLabels: z.array(z.string()),
});
export type CaptureMappingResponseT = z.infer<typeof CaptureMappingResponse>;

export const SetCaptureMappingRequest = z.object({ mappings: z.array(CaptureMappingEntry) });
export type SetCaptureMappingRequestT = z.infer<typeof SetCaptureMappingRequest>;
