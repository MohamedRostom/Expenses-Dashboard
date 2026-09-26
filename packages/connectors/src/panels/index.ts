/**
 * Panel provider interfaces and common types for mail and calendar sources.
 * Every provider client (Google, Microsoft, standards) implements these.
 */

/** Calendar event occurrence (expanded, single instance). */
export interface EventOccurrence {
  providerEventId: string;
  calendarId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timeZone?: string;
  location?: string;
  tentative: boolean;
  declined: boolean;
  link?: string;
}

/** Email message header. */
export interface MessageHeader {
  providerMessageId: string;
  fromName?: string;
  fromAddress: string;
  subject: string;
  preview: string; // at most 200 chars
  receivedAt: Date;
  unread: boolean;
  link?: string;
}

/** Calendar source interface. */
export interface CalendarSource {
  listCalendars(
    cred: unknown,
  ): Promise<Array<{ id: string; name: string; isPrimary: boolean; colour?: string }>>;
  fetchWindow(
    cred: unknown,
    calendarIds: string[],
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{
    events: EventOccurrence[];
    cursor?: string;
    full: boolean;
    rotatedCredential?: unknown;
  }>;
  verify(cred: unknown): Promise<void>;
  revoke(cred: unknown): Promise<void>;
}

/** Mail source interface. */
export interface MailSource {
  fetchInbox(
    cred: unknown,
    limit: number,
    cursor?: string,
  ): Promise<{
    messages: MessageHeader[];
    unreadTotal?: number;
    cursor?: string;
    full: boolean;
    rotatedCredential?: unknown;
  }>;
  verify(cred: unknown): Promise<void>;
  revoke(cred: unknown): Promise<void>;
}

/** Authentication error; reconnection needed. */
export class AuthError extends Error {
  override name = 'AuthError';
  constructor(message: string) {
    super(message);
  }
}

/** Rate limited; retry after retryAfterMs. */
export class RateLimited extends Error {
  override name = 'RateLimited';
  constructor(
    message: string,
    public retryAfterMs: number,
  ) {
    super(message);
  }
}

/** Verification error (step in 'connect' | 'login' | 'inbox' | 'discovery'). */
export class VerificationError extends Error {
  override name = 'VerificationError';
  constructor(
    message: string,
    public step: 'connect' | 'login' | 'inbox' | 'discovery',
  ) {
    super(message);
  }
}

/** Provider error (generic). */
export class ProviderError extends Error {
  override name = 'ProviderError';
  constructor(message: string) {
    super(message);
  }
}
