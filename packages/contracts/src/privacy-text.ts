import type { ProviderIdT } from './connections.js';

/** T073/FR-016: single source for the per-provider privacy text. The connect card in
 * `apps/web/src/views/ConnectionsView.vue` and the privacy page in
 * `apps/landing/src/pages/privacy.vue` both render this, so the two can never drift out of
 * sync — verification reviewers compare the requested scopes against the privacy text and the
 * demo, and a mismatch fails review (research.md R6). */
export type ProviderPrivacyText = {
  /** What Desk reads from the provider. */
  reads: string;
  /** What Desk stores locally, and the per-account cap. */
  stores: string;
  /** Refresh cadence and the 30-day idle purge (FR-012). */
  retention: string;
  /** How to revoke access, including providers with no revoke API (FR-003). */
  revoke: string;
  /** Exact OAuth scopes (or, for standards-based, what credential is used) — research.md R6. */
  scopes: string[];
};

const STORES =
  'Event title, time, location and status for events; sender, subject, a one-line preview ' +
  'and received time for messages. Never message bodies or attachments. Capped at the newest ' +
  'fifty messages per account.';

const RETENTION =
  'Refreshed every five minutes while you are active, hourly otherwise. If you do not visit ' +
  'Desk for 30 days, every cached message and event is purged; the connection and its ' +
  'credentials stay, and data is refetched the next time you visit.';

export const PROVIDER_PRIVACY_TEXT: Record<ProviderIdT, ProviderPrivacyText> = {
  google: {
    reads:
      'Calendar events on the calendars you enable, and, once Google mail is live for your ' +
      'account, headers and a one-line preview of your inbox.',
    stores: STORES,
    retention: RETENTION,
    revoke:
      'Disconnect the account in Settings — Desk revokes its Google access at the same time. ' +
      'You can also remove Desk yourself at myaccount.google.com/permissions.',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
  },
  microsoft: {
    reads:
      'Calendar events on the calendars you enable, and headers and a one-line preview of your inbox.',
    stores: STORES,
    retention: RETENTION,
    revoke:
      'Disconnect the account in Settings, then remove Desk yourself at ' +
      'account.microsoft.com/privacy under "Apps and services" — Desk cannot revoke Microsoft ' +
      'access on its own.',
    scopes: ['Calendars.Read', 'Mail.Read', 'offline_access', 'User.Read'],
  },
  standards: {
    reads:
      'Calendar events over CalDAV and message headers over IMAP, using the app-specific ' +
      'password you provide. Where the provider offers no preview of its own, Desk reads at ' +
      'most the first 200 bytes of the message text to build the one-line preview, then ' +
      'discards the rest (FR-013).',
    stores: STORES,
    retention: RETENTION,
    revoke:
      'Disconnect the account in Settings, then delete or change the app-specific password ' +
      "you created for Desk in your provider's account security settings — Desk cannot " +
      'revoke a standards-based account on its own.',
    scopes: ['The app-specific password you supply — no OAuth scopes are requested.'],
  },
};
