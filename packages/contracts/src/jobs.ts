import { z } from 'zod';

export const JobStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type JobStatusT = z.infer<typeof JobStatus>;

/** GET /jobs/:id */
export const JobResponse = z.object({
  id: z.string(),
  name: z.string(),
  status: JobStatus,
  progressDone: z.number().int(),
  progressTotal: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type JobResponseT = z.infer<typeof JobResponse>;

/** GET /flags */
export const FlagsResponse = z.object({ flags: z.record(z.string(), z.boolean()) });
export type FlagsResponseT = z.infer<typeof FlagsResponse>;
