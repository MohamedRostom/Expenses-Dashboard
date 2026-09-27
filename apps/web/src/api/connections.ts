import {
  type AccountPatchT,
  type AccountT,
  type ConnectionsResponseT,
  type ProvidersResponseT,
  type CalendarsResponseT,
  type ReconnectResponseT,
  type StandardsCreateT,
  type StandardsCreateResponseT,
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

export async function patchConnection(
  accountId: string,
  patch: AccountPatchT,
): Promise<{ account: AccountT }> {
  return apiFetch<{ account: AccountT }>(`/connections/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteConnection(accountId: string): Promise<void> {
  await apiFetch<void>(`/connections/${accountId}`, { method: 'DELETE' });
}

export async function postStandardsConnection(
  payload: StandardsCreateT,
): Promise<StandardsCreateResponseT> {
  return apiFetch<StandardsCreateResponseT>('/connections/standards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
