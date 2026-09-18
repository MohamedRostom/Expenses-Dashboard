import { z } from 'zod';

/** GET /rates query */
export const RatePreviewQuery = z.object({
  date: z.string().optional(),
  from: z.string().length(3),
  to: z.string().length(3),
});
export type RatePreviewQueryT = z.infer<typeof RatePreviewQuery>;

/** GET /rates response */
export const RatePreviewResponse = z.union([
  z.object({
    rate: z.string(),
    rateDate: z.string(),
    source: z.string(),
  }),
  z.object({ unsupported: z.literal(true) }),
]);
export type RatePreviewResponseT = z.infer<typeof RatePreviewResponse>;
