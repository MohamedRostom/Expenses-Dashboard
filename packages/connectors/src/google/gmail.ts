import { refreshAccessToken, revoke } from './oauth.js';
import type { MailSource, MessageHeader } from '../panels/index.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  oauthEndpoints?: { token?: string; revoke?: string };
  fetchImpl?: typeof fetch;
}

export interface GmailMessageMetadata {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
}

interface GmailMessagesListResponse {
  messages?: Array<{ id: string; threadId?: string }>;
  resultSizeEstimate?: number;
}

interface GmailHistoryResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: { id: string } }>;
    labelsAdded?: Array<{ message: { id: string } }>;
    labelsRemoved?: Array<{ message: { id: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  pound: '£',
};

/** Decode the HTML entities Gmail's `snippet` field is escaped with. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** Parse a `From` header of the form `Name <address>` or a bare address. */
// ponytail: no RFC 2047 encoded-word decoding (`=?UTF-8?B?...?=`) for non-ASCII display names —
// add if a real account fixture ever needs one; Gmail's own web client always shows encoded
// names verbatim in metadata-format responses, so this is a documented gap, not a guess.
export function parseFrom(value: string): { fromName?: string; fromAddress: string } {
  const trimmed = value.trim();
  const m = /^(.*)<([^>]+)>\s*$/.exec(trimmed);
  if (m) {
    const name = m[1]!.trim().replace(/^"(.*)"$/, '$1');
    return name ? { fromName: name, fromAddress: m[2]!.trim() } : { fromAddress: m[2]!.trim() };
  }
  return { fromAddress: trimmed };
}

function header(raw: GmailMessageMetadata, name: string): string {
  return (
    raw.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  );
}

/** Map a Gmail `messages.get?format=metadata` response to a MessageHeader (contracts/providers.md). */
export function toMessageHeader(raw: GmailMessageMetadata): MessageHeader {
  const { fromName, fromAddress } = parseFrom(header(raw, 'From'));
  const message: MessageHeader = {
    providerMessageId: raw.id,
    fromAddress,
    subject: header(raw, 'Subject'),
    preview: decodeHtmlEntities(raw.snippet ?? '').slice(0, 200),
    receivedAt: new Date(Number(raw.internalDate ?? 0)),
    unread: (raw.labelIds ?? []).includes('UNREAD'),
    link: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
  };
  if (fromName) message.fromName = fromName;
  return message;
}

/** Thrown internally when `history.list` 404s (the start point fell out of Gmail's retention). */
class HistoryTooOld extends Error {}

export function createGmailSource(config: GmailConfig): MailSource {
  const fetchImpl = config.fetchImpl || fetch;

  async function accessToken(cred: unknown): Promise<string> {
    const credential = cred as { refreshToken: string };
    const tokenResult = await refreshAccessToken(
      {
        refreshToken: credential.refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
      fetchImpl,
      config.oauthEndpoints,
    );
    return tokenResult.accessToken;
  }

  function checkStatus(response: Response): void {
    if (response.status === 401) {
      throw new AuthError('Invalid credentials');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      throw new RateLimited('Rate limited', retryAfterMs);
    }
  }

  async function getJson<T>(url: string, token: string): Promise<T> {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    checkStatus(response);
    if (!response.ok) {
      throw new ProviderError(`gmail ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function getUnreadTotal(token: string): Promise<number | undefined> {
    const data = await getJson<{ messagesUnread?: number }>(
      `${config.apiBase}/gmail/v1/users/me/labels/INBOX`,
      token,
    );
    return data.messagesUnread;
  }

  async function fetchMessage(id: string, token: string): Promise<GmailMessageMetadata> {
    const url = new URL(`${config.apiBase}/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
    url.searchParams.set('format', 'metadata');
    url.searchParams.append('metadataHeaders', 'From');
    url.searchParams.append('metadataHeaders', 'Subject');
    url.searchParams.append('metadataHeaders', 'Date');
    return getJson<GmailMessageMetadata>(url.toString(), token);
  }

  async function fullFetch(
    token: string,
    limit: number,
  ): Promise<{ messages: MessageHeader[]; unreadTotal?: number; cursor?: string; full: true }> {
    const url = new URL(`${config.apiBase}/gmail/v1/users/me/messages`);
    url.searchParams.set('labelIds', 'INBOX');
    url.searchParams.set('q', '-category:promotions -category:social');
    url.searchParams.set('maxResults', String(limit));
    const list = await getJson<GmailMessagesListResponse>(url.toString(), token);

    const messages: MessageHeader[] = [];
    let maxHistoryId: bigint | undefined;
    for (const item of list.messages ?? []) {
      const raw = await fetchMessage(item.id, token);
      messages.push(toMessageHeader(raw));
      if (raw.historyId) {
        const historyId = BigInt(raw.historyId);
        if (maxHistoryId === undefined || historyId > maxHistoryId) maxHistoryId = historyId;
      }
    }

    let cursor = maxHistoryId?.toString();
    if (!cursor) {
      // Empty inbox: no message carries a historyId, so ask the profile for the mailbox's own.
      const profile = await getJson<{ historyId?: string }>(
        `${config.apiBase}/gmail/v1/users/me/profile`,
        token,
      );
      cursor = profile.historyId;
    }

    const unreadTotal = await getUnreadTotal(token);
    const result: { messages: MessageHeader[]; unreadTotal?: number; cursor?: string; full: true } =
      { messages, full: true };
    if (unreadTotal !== undefined) result.unreadTotal = unreadTotal;
    if (cursor) result.cursor = cursor;
    return result;
  }

  async function incrementalFetch(
    token: string,
    cursor: string,
  ): Promise<{ messages: MessageHeader[]; unreadTotal?: number; cursor?: string; full: false }> {
    const addedIds = new Set<string>();
    let historyId: string | undefined;
    let pageToken: string | undefined;

    while (true) {
      const url = new URL(`${config.apiBase}/gmail/v1/users/me/history`);
      url.searchParams.set('startHistoryId', cursor);
      // Label changes carry read state (UNREAD removed = read in Gmail), so those messages are
      // re-read too and the cached unread flag follows.
      for (const type of ['messageAdded', 'labelAdded', 'labelRemoved']) {
        url.searchParams.append('historyTypes', type);
      }
      url.searchParams.set('labelId', 'INBOX');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        throw new HistoryTooOld();
      }
      checkStatus(response);
      if (!response.ok) {
        throw new ProviderError(`gmail ${response.status}`);
      }
      const data = (await response.json()) as GmailHistoryResponse;

      for (const entry of data.history ?? []) {
        for (const changed of [
          ...(entry.messagesAdded ?? []),
          ...(entry.labelsAdded ?? []),
          ...(entry.labelsRemoved ?? []),
        ]) {
          addedIds.add(changed.message.id);
        }
      }
      if (data.historyId) historyId = data.historyId;
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const messages: MessageHeader[] = [];
    for (const id of addedIds) {
      const raw = await fetchMessage(id, token);
      messages.push(toMessageHeader(raw));
    }

    const unreadTotal = await getUnreadTotal(token);
    const result: {
      messages: MessageHeader[];
      unreadTotal?: number;
      cursor?: string;
      full: false;
    } = { messages, full: false };
    if (unreadTotal !== undefined) result.unreadTotal = unreadTotal;
    if (historyId) result.cursor = historyId;
    return result;
  }

  return {
    async fetchInbox(
      cred: unknown,
      limit: number,
      cursor?: string,
    ): Promise<{
      messages: MessageHeader[];
      unreadTotal?: number;
      cursor?: string;
      full: boolean;
      rotatedCredential?: unknown;
    }> {
      const token = await accessToken(cred);
      if (cursor) {
        try {
          return await incrementalFetch(token, cursor);
        } catch (e) {
          if (!(e instanceof HistoryTooOld)) throw e;
          // Fall through: the start point is gone, so refetch the whole inbox.
        }
      }
      return await fullFetch(token, limit);
    },

    async verify(cred: unknown): Promise<void> {
      const token = await accessToken(cred);
      await getJson(`${config.apiBase}/gmail/v1/users/me/profile`, token);
    },

    async revoke(cred: unknown): Promise<void> {
      const credential = cred as { refreshToken: string };
      await revoke(credential.refreshToken, fetchImpl, config.oauthEndpoints);
    },
  };
}
