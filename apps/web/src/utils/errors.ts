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
  | 'source_unreachable'
  | 'source_limit_reached'
  | 'place_not_found'
  | 'server_error';

/** Maps a thrown error (ApiError, network TypeError, or anything else) to a PanelErrorKind. */
export function toPanelErrorKind(err: unknown): PanelErrorKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (err instanceof ApiError) {
    if (err.status === 401) return 'session_expired';
    if (err.code === 'rate_unavailable') return 'rate_unavailable';
    if (err.code === 'validation_failed') return 'validation';
    if (
      err.code === 'source_unreachable' ||
      err.code === 'source_limit_reached' ||
      err.code === 'place_not_found'
    ) {
      return err.code;
    }
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

/** Copy for `POST /connections/standards` (contracts/api.md), keyed by verification `step`
 * (FR-018: "errors name the failing step") for the IMAP/CalDAV connect flow the standards form
 * runs through: connect (host reachable) -> login -> inbox (IMAP) / discovery (CalDAV). */
const STANDARDS_STEP_COPY: Record<string, string> = {
  connect: "Desk couldn't reach that server. Check the host and port and try again.",
  login: 'That address or app password was rejected. Check them and try again.',
  inbox: "Signed in, but the inbox couldn't be opened. Check the account has IMAP access.",
  discovery: 'Signed in, but no calendar was found at that address. Check the CalDAV URL.',
};

/** Maps a thrown error from `postStandardsConnection` to the copy the form's error summary
 * shows (FR-017, FR-018). */
export function standardsErrorCopy(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'verification_failed') {
      const step = err.details?.['step'];
      return (
        (typeof step === 'string' && STANDARDS_STEP_COPY[step]) ||
        'Desk could not verify that account. Check the details and try again.'
      );
    }
    if (err.code === 'host_not_allowed') {
      return "That host isn't allowed. Desk only connects to public internet mail and calendar servers.";
    }
    if (err.code === 'rate_limited') {
      return 'Too many attempts. Wait a few minutes and try again.';
    }
    if (err.code === 'limit_reached') {
      return 'You can connect up to 10 accounts. Disconnect one to add another.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
