import { ApiError } from '../api/client.js';
import type { AccountErrorCodeT } from '@desk/contracts';

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

/** Copy for `account.lastError` (contracts/api.md: "an error code, never provider text; the web
 * app maps each code to its own copy"), read from a connected account's status badge / last
 * error line in ConnectionsView.vue (T062). */
const ACCOUNT_ERROR_COPY: Record<AccountErrorCodeT, string> = {
  provider_unreachable: "Couldn't reach the provider. Desk will retry automatically.",
  access_revoked: 'Access was revoked at the provider. Reconnect to keep this account working.',
  rate_limited: 'The provider is rate-limiting Desk right now. Desk will retry automatically.',
  login_failed: 'The stored sign-in stopped working. Reconnect to fix this.',
  host_not_allowed: "This account's mail or calendar host is not allowed and can't be refreshed.",
};

export function accountErrorCopy(code: string | null): string | null {
  if (!code) return null;
  return ACCOUNT_ERROR_COPY[code as AccountErrorCodeT] ?? code;
}

/** Copy for the `?error=<code>` query param a provider connect/callback redirect can leave on
 * `/settings/connections` (contracts/api.md GET /connections/:provider/callback). */
const CONNECT_ERROR_COPY: Record<string, string> = {
  scope_denied: 'No access was granted, so no account was connected. Try again and allow access.',
  limit_reached: 'You can connect up to 10 accounts. Disconnect one to add another.',
  account_mismatch: "That provider account doesn't match the one you're reconnecting.",
  invalid_state: 'The connection attempt expired or was invalid. Please try again.',
  provider_unreachable: "Couldn't reach the provider. Please try again.",
  verification_failed: 'Desk could not verify that account. Check the details and try again.',
  host_not_allowed: 'That mail or calendar host is not allowed.',
};

export function connectErrorCopy(code: string): string {
  return CONNECT_ERROR_COPY[code] ?? 'Something went wrong connecting that account.';
}
