import type { TodayResponseT, RefreshResponseT } from '@desk/contracts';
import { apiFetch } from './client.js';

export async function getToday(): Promise<TodayResponseT> {
  return apiFetch<TodayResponseT>('/panels/today');
}

export async function postTodayRefresh(): Promise<RefreshResponseT> {
  return apiFetch<RefreshResponseT>('/panels/today/refresh', { method: 'POST' });
}
