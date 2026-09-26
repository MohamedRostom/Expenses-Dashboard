import type { TodayResponseT, RefreshResponseT } from '@desk/contracts';
import { apiFetch } from './client.js';

export async function getToday(): Promise<TodayResponseT> {
  return apiFetch<TodayResponseT>('/today');
}

export async function postTodayRefresh(): Promise<RefreshResponseT> {
  return apiFetch<RefreshResponseT>('/today/refresh', { method: 'POST' });
}
