import { ApiError } from '../api/client.js';

/** Error-copy kinds a panel can be in, per CLAUDE.md: "error copy branches on error code,
 * never one generic banner." Distinct from @desk/contracts's ErrorCodeT — those are the API's
 * wire codes; these are the wider set of user-facing situations a panel can hit (including
 * client-only ones like being offline). */
export type PanelErrorKind =
  | 'offline'
  | 'session_expired'
  | 'validation'
  | 'rate_unavailable'
  | 'connector_error'
  | 'server_error';

/** Maps a thrown error (ApiError, network TypeError, or anything else) to a PanelErrorKind. */
export function toPanelErrorKind(err: unknown): PanelErrorKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (err instanceof ApiError) {
    if (err.status === 401) return 'session_expired';
    if (err.code === 'rate_unavailable') return 'rate_unavailable';
    if (err.code === 'validation_failed') return 'validation';
    if (err.status >= 500) return 'server_error';
    if (err.details?.['connector']) return 'connector_error';
    return 'server_error';
  }
  return 'server_error';
}
