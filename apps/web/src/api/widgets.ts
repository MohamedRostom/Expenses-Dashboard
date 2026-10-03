import type {
  WidgetCreateT,
  WidgetPatchT,
  WidgetResponseT,
  WidgetsRefreshResponseT,
  WidgetsResponseT,
  WidgetTypesResponseT,
} from '@desk/contracts';
import { apiFetch } from './client.js';

export const getWidgets = () => apiFetch<WidgetsResponseT>('/widgets');

export const getWidgetTypes = () => apiFetch<WidgetTypesResponseT>('/widgets/types');

export const createWidget = (body: WidgetCreateT) =>
  apiFetch<WidgetResponseT>('/widgets', { method: 'POST', body: JSON.stringify(body) });

export const patchWidget = (id: string, body: WidgetPatchT) =>
  apiFetch<WidgetResponseT>(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteWidget = (id: string) => apiFetch<void>(`/widgets/${id}`, { method: 'DELETE' });

export const putWidgetsOrder = (ids: string[]) =>
  apiFetch<WidgetsResponseT>('/widgets/order', { method: 'PUT', body: JSON.stringify({ ids }) });

export const postWidgetsRefresh = () =>
  apiFetch<WidgetsRefreshResponseT>('/widgets/refresh', { method: 'POST' });
