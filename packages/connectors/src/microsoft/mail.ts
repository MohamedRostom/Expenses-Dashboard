import { refreshAccessToken } from './oauth.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';
import type { MailSource, MessageHeader } from '../panels/index.js';

export interface MicrosoftRawMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  isRead: boolean;
  webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  '@removed'?: { reason: string };
  [key: string]: unknown;
}

export interface GraphMailDeltaResponse {
  value: MicrosoftRawMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/** Map a Graph message to a MessageHeader (contracts/providers.md); preview is capped at 200 chars. */
export function toMessageHeader(item: MicrosoftRawMessage): MessageHeader {
  const result: MessageHeader = {
    providerMessageId: item.id,
    fromAddress: item.from?.emailAddress?.address ?? '',
    subject: item.subject ?? '',
    preview: (item.bodyPreview ?? '').slice(0, 200),
    receivedAt: new Date(item.receivedDateTime),
    unread: !item.isRead,
  };
  if (item.from?.emailAddress?.name) result.fromName = item.from.emailAddress.name;
  if (item.webLink) result.link = item.webLink;
  return result;
}

type FetchInboxResult = Awaited<ReturnType<MailSource['fetchInbox']>>;

/** Graph lost the delta state (410 or `syncStateNotFound`): refetch the full inbox. */
class SyncStateLost extends Error {}

export function createMicrosoftMailSource({
  clientId,
  clientSecret,
  apiBase,
  oauthEndpoints,
  fetchImpl,
}: {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  oauthEndpoints?: { token?: string };
  fetchImpl: typeof fetch;
}): MailSource {
  const token = (cred: unknown) =>
    refreshAccessToken(
      { refreshToken: (cred as { refreshToken: string }).refreshToken, clientId, clientSecret },
      fetchImpl,
      oauthEndpoints,
    );

  async function get<T>(url: string, accessToken: string): Promise<T> {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) throw new AuthError('graph mail 401');
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      throw new RateLimited('graph mail 429', retryAfter > 0 ? retryAfter * 1000 : 60_000);
    }
    if (res.status === 410) throw new SyncStateLost();
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'syncStateNotFound') throw new SyncStateLost();
    throw new ProviderError(`graph mail ${res.status}`);
  }

  /** Walks nextLink pages from `url` until `limit` messages are collected or pages run out; the
   * last page fetched's deltaLink (only present once nextLink stops appearing) is the next cursor.
   * ponytail: stopping early on `limit` before the final page means no cursor comes back for that
   * refresh (falls back to a full fetch next time) — fine at fifty messages per account; revisit
   * if a provider habitually pages in small chunks. */
  async function walk(url: string, accessToken: string, limit: number) {
    const messages: MessageHeader[] = [];
    let cursor: string | undefined;
    let next: string | undefined = url;
    while (next && messages.length < limit) {
      const page: GraphMailDeltaResponse = await get(next, accessToken);
      for (const item of page.value) {
        // Removed messages are dropped, not reported: full fetches replace the cache wholesale,
        // so there is nothing for an incremental fetch to signal here (providers.md MailSource
        // has no deletedIds field, unlike CalendarSource).
        if (item['@removed']) continue;
        messages.push(toMessageHeader(item));
      }
      next = page['@odata.nextLink'];
      cursor = page['@odata.deltaLink'] ?? cursor;
    }
    if (messages.length > limit) messages.length = limit;
    return { messages, cursor };
  }

  return {
    async fetchInbox(cred, limit, cursor) {
      const { accessToken, rotatedRefreshToken } = await token(cred);
      const fullUrl =
        `${apiBase}/v1.0/me/mailFolders/inbox/messages/delta?` +
        new URLSearchParams({
          $select: 'from,subject,bodyPreview,receivedDateTime,isRead,webLink',
          $top: '50',
        });

      let full = !cursor;
      let page;
      try {
        page = await walk(cursor ?? fullUrl, accessToken, limit);
      } catch (err) {
        if (!(err instanceof SyncStateLost) || !cursor) throw err;
        full = true;
        page = await walk(fullUrl, accessToken, limit);
      }

      const result: FetchInboxResult = { messages: page.messages, full };
      if (page.cursor) result.cursor = page.cursor;
      if (rotatedRefreshToken) result.rotatedCredential = { refreshToken: rotatedRefreshToken };
      return result;
    },

    async verify(cred) {
      const { accessToken } = await token(cred);
      await get(`${apiBase}/v1.0/me`, accessToken);
    },

    // Microsoft exposes no revoke endpoint; the user removes the app from their account.
    async revoke() {},
  };
}
