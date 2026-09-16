import { z } from 'zod';

/** Shape of GET /healthz. Shared by the API (producer) and the web app (consumer). */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  sha: z.string(),
});
export type HealthResponseT = z.infer<typeof HealthResponse>;
