import { z } from 'zod';

/** A geocoding result; also the `place` body of POST/PATCH /widgets (spec 003 contracts/api.md). */
export const PlaceCandidate = z.object({
  name: z.string(),
  admin1: z.string().nullable(),
  country: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timeZone: z.string(),
});
export type PlaceCandidateT = z.infer<typeof PlaceCandidate>;

export const SearchQuery = z.object({ q: z.string().trim().min(3).max(80) });
export type SearchQueryT = z.infer<typeof SearchQuery>;

export const ResolveBody = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type ResolveBodyT = z.infer<typeof ResolveBody>;

export const CandidatesResponse = z.object({
  candidates: z.array(PlaceCandidate).max(5),
  approximate: z.boolean().optional(),
});
export type CandidatesResponseT = z.infer<typeof CandidatesResponse>;
