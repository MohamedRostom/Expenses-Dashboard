import {
  type ConnectionsResponseT,
  type ProvidersResponseT,
  type CalendarsResponseT,
  type ReconnectResponseT,
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

export async function postReconnect(accountId: string): Promise<ReconnectResponseT> {
  return apiFetch<ReconnectResponseT>(`/connections/${accountId}/reconnect`, { method: 'POST' });
}
