import { z } from 'zod';

/** Shape of GET /healthz. Shared by the API (producer) and the web app (consumer). */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  sha: z.string(),
  // T109: db probe result for the external uptime monitor (contracts/api.md). Always 200 —
  // 'degraded' communicates a slow/broken DB without hard-failing the whole check.
  db: z.enum(['ok', 'degraded']),
});
export type HealthResponseT = z.infer<typeof HealthResponse>;

export const FeedbackRequest = z.object({
  page: z.string().min(1).max(500),
  message: z.string().min(1).max(2000),
  contactOk: z.boolean(),
});
export type FeedbackRequestT = z.infer<typeof FeedbackRequest>;
