import {
  type ConnectionsResponseT,
  type ProvidersResponseT,
  type CalendarsResponseT,
} from '@desk/contracts';
import { apiFetch } from './client.js';

export async function getConnections(): Promise<ConnectionsResponseT> {
  return apiFetch<ConnectionsResponseT>('/connections');
}

export async function getProviders(): Promise<ProvidersResponseT> {
  return apiFetch<ProvidersResponseT>('/connections/providers');
}

export async function getCalendars(accountId: string): Promise<CalendarsResponseT> {
  return apiFetch<CalendarsResponseT>(`/connections/${accountId}/calendars`);
}
