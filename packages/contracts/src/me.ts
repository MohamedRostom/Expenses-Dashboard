import { z } from 'zod';
import { UserResponse } from './auth.js';

export const MeResponse = z.object({ user: UserResponse });
export type MeResponseT = z.infer<typeof MeResponse>;

export const PatchMeRequest = z.object({
  theme: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
  timeZone: z.string().optional(),
  onboardingCompletedAt: z.string().nullable().optional(),
});
export type PatchMeRequestT = z.infer<typeof PatchMeRequest>;

export const PatchMeResponse = z.object({
  user: UserResponse,
  job: z.object({ id: z.string() }).optional(),
});
export type PatchMeResponseT = z.infer<typeof PatchMeResponse>;

export const ChangeEmailRequest = z.object({
  newEmail: z.string().email(),
  password: z.string().optional(),
});
export type ChangeEmailRequestT = z.infer<typeof ChangeEmailRequest>;

export const ConfirmEmailRequest = z.object({ token: z.string() });
export type ConfirmEmailRequestT = z.infer<typeof ConfirmEmailRequest>;
export const ConfirmEmailResponse = z.object({ user: UserResponse });
export type ConfirmEmailResponseT = z.infer<typeof ConfirmEmailResponse>;

export const DeleteMeRequest = z.object({ password: z.string().optional() });
export type DeleteMeRequestT = z.infer<typeof DeleteMeRequest>;

export const SessionSummary = z.object({
  id: z.string(),
  current: z.boolean(),
  lastSeenAt: z.string(),
  userAgent: z.string().nullable(),
});
export type SessionSummaryT = z.infer<typeof SessionSummary>;

export const SessionsResponse = z.object({ sessions: z.array(SessionSummary) });
export type SessionsResponseT = z.infer<typeof SessionsResponse>;

export const CurrencyEntry = z.object({
  code: z.string(),
  name: z.string(),
  exponent: z.number().int(),
});
export type CurrencyEntryT = z.infer<typeof CurrencyEntry>;

export const CurrenciesResponse = z.object({ currencies: z.array(CurrencyEntry) });
export type CurrenciesResponseT = z.infer<typeof CurrenciesResponse>;

/** GET /me/export document (data-model.md). */
export const ExportDocument = z.object({
  exportedAt: z.string(),
  user: UserResponse,
  categories: z.array(z.record(z.string(), z.unknown())),
  expenses: z.array(z.record(z.string(), z.unknown())),
  importBatches: z.array(z.record(z.string(), z.unknown())),
  notion: z.object({
    connected: z.boolean(),
    direction: z.string().nullable(),
    databaseId: z.string().nullable(),
  }),
  version: z.literal(1),
});
export type ExportDocumentT = z.infer<typeof ExportDocument>;
