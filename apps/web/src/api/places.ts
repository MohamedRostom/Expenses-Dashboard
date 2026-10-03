import type { CandidatesResponseT } from '@desk/contracts';
import { apiFetch } from './client.js';

export const searchPlaces = (q: string) =>
  apiFetch<CandidatesResponseT>(`/places/search?q=${encodeURIComponent(q)}`);

export const resolvePlace = (lat: number, lon: number) =>
  apiFetch<CandidatesResponseT>('/places/resolve', {
    method: 'POST',
    body: JSON.stringify({ lat, lon }),
  });
