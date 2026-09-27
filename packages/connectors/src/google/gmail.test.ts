import { describe, expect, it, vi } from 'vitest';
import { createGmailSource, decodeHtmlEntities, parseFrom, toMessageHeader } from './gmail.js';
import { GoogleFake } from './fake.js';
import { AuthError, RateLimited } from '../panels/index.js';
import messagesListFixture from './fixtures/mail/messages-list.json';
import message1Fixture from './fixtures/mail/message-1.json';
import message2Fixture from './fixtures/mail/message-2.json';
import message3Fixture from './fixtures/mail/message-3.json';
import historyIncrementalFixture from './fixtures/mail/history-incremental.json';
import labelsInboxFixture from './fixtures/mail/labels-inbox.json';
import profileFixture from './fixtures/mail/profile.json';
import error404Fixture from './fixtures/mail/error-404-history-too-old.json';
import error401Fixture from './fixtures/mail/error-401.json';
import error429Fixture from './fixtures/mail/error-429.json';

/** True for the Google OAuth token endpoint the fake fetch must intercept before hitting the real API mock. */
function isTokenUrl(url: string): boolean {
  const { hostname, pathname } = new URL(url);
  return hostname === 'oauth2.googleapis.com' && pathname === '/token';
}

const messagesById: Record<string, unknown> = {
  'msg-1': message1Fixture,
  'msg-2': message2Fixture,
  'msg-3': message3Fixture,
};

/** Routes the full-fetch endpoints (messages.list, messages.get, labels/INBOX) to fixtures. */
function fullFetchImpl(): typeof fetch {
  return vi.fn(async (url: string) => {
    if (isTokenUrl(url)) {
      return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
    }
    const { pathname } = new URL(url);
    if (pathname === '/gmail/v1/users/me/messages') {
      return new Response(JSON.stringify(messagesListFixture), { status: 200 });
    }
    if (pathname === '/gmail/v1/users/me/labels/INBOX') {
      return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
    }
    const match = /\/gmail\/v1\/users\/me\/messages\/([^/?]+)$/.exec(pathname);
    if (match) {
      return new Response(JSON.stringify(messagesById[match[1]!]), { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('Gmail Source', () => {
  describe('contract test: real client vs fake', () => {
    it('full fetch: lists, fetches metadata per id, maps headers, decodes snippet, sets cursor from the newest historyId', async () => {
      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl: fullFetchImpl(),
      });

      const result = await source.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(result.full).toBe(true);
      expect(result.cursor).toBe('1005'); // max(historyId) of msg-1 (1000) and msg-2 (1005)
      expect(result.unreadTotal).toBe(7);
      expect(result.messages.map((m) => m.providerMessageId).sort()).toEqual(['msg-1', 'msg-2']);

      const msg1 = result.messages.find((m) => m.providerMessageId === 'msg-1')!;
      expect(msg1.fromName).toBe('Aisha Bello');
      expect(msg1.fromAddress).toBe('aisha.bello@example.test');
      expect(msg1.subject).toBe('Q3 Expenses follow-up');
      expect(msg1.preview).toBe(
        "Hey, just checking in about the invoice 'Q3 Expenses' — let me know if you need anything else.",
      );
      expect(msg1.unread).toBe(true);
      expect(msg1.receivedAt).toEqual(new Date(1759000000000));
      expect(msg1.link).toBe('https://mail.google.com/mail/u/0/#inbox/msg-1');

      const msg2 = result.messages.find((m) => m.providerMessageId === 'msg-2')!;
      expect(msg2.fromName).toBe('Receipts');
      expect(msg2.preview).toBe('Your receipt for order #4821 is attached. Total: £42.10');
      expect(msg2.unread).toBe(false);
    });

    it('full fetch matches the fake given the same raw messages', async () => {
      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl: fullFetchImpl(),
      });
      const fake = new GoogleFake({
        mail: { messages: [message1Fixture, message2Fixture] as never },
      });

      const cred = { refreshToken: 'rt-test' };
      const realResult = await source.fetchInbox(cred, 10);
      const fakeResult = await fake.fetchInbox(cred, 10);

      const sortById = (a: { providerMessageId: string }, b: { providerMessageId: string }) =>
        a.providerMessageId.localeCompare(b.providerMessageId);

      // unreadTotal is left out of this comparison: the real client's number comes from the
      // `labels/INBOX` fixture, which is recorded independently of the two sample messages here.
      expect([...realResult.messages].sort(sortById)).toEqual(
        [...fakeResult.messages].sort(sortById),
      );
      expect(realResult.full).toBe(fakeResult.full);
    });

    it('incremental fetch: uses startHistoryId, fetches only the added message, full is false', async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname, searchParams } = new URL(url);
        if (pathname === '/gmail/v1/users/me/history') {
          expect(searchParams.get('startHistoryId')).toBe('1005');
          expect(searchParams.getAll('historyTypes')).toEqual([
            'messageAdded',
            'labelAdded',
            'labelRemoved',
          ]);
          expect(searchParams.get('labelId')).toBe('INBOX');
          return new Response(JSON.stringify(historyIncrementalFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/messages/msg-3') {
          return new Response(JSON.stringify(message3Fixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      const result = await source.fetchInbox({ refreshToken: 'rt-test' }, 10, '1005');

      expect(result.full).toBe(false);
      expect(result.cursor).toBe('2000');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.providerMessageId).toBe('msg-3');
    });

    // Reading a message in Gmail removes its UNREAD label; the incremental sync must re-read it so
    // the cached row and the unread count follow (US2's independent test).
    it('incremental fetch re-reads a message whose labels changed, so a read message comes back read', async () => {
      const readMsg1 = { ...message1Fixture, labelIds: ['INBOX'] };
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname } = new URL(url);
        if (pathname === '/gmail/v1/users/me/history') {
          return new Response(
            JSON.stringify({
              history: [
                { id: '2001', labelsRemoved: [{ message: { id: 'msg-1' }, labelIds: ['UNREAD'] }] },
              ],
              historyId: '2001',
            }),
            { status: 200 },
          );
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/messages/msg-1') {
          return new Response(JSON.stringify(readMsg1), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });
      const result = await source.fetchInbox({ refreshToken: 'rt-test' }, 10, '2000');

      expect(result.messages.map((m) => [m.providerMessageId, m.unread])).toEqual([
        ['msg-1', false],
      ]);
      expect(result.cursor).toBe('2001');
    });

    it('404 on history.list falls back to a full fetch', async () => {
      let historyCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname } = new URL(url);
        if (pathname === '/gmail/v1/users/me/history') {
          historyCalls++;
          return new Response(JSON.stringify(error404Fixture), { status: 404 });
        }
        if (pathname === '/gmail/v1/users/me/messages') {
          return new Response(JSON.stringify(messagesListFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        const match = /\/gmail\/v1\/users\/me\/messages\/([^/?]+)$/.exec(pathname);
        if (match) {
          return new Response(JSON.stringify(messagesById[match[1]!]), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      const result = await source.fetchInbox({ refreshToken: 'rt-test' }, 10, 'too-old');

      expect(historyCalls).toBe(1);
      expect(result.full).toBe(true);
      expect(result.messages.map((m) => m.providerMessageId).sort()).toEqual(['msg-1', 'msg-2']);
    });

    it('empty inbox falls back to users.getProfile for the cursor', async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname } = new URL(url);
        if (pathname === '/gmail/v1/users/me/messages') {
          return new Response(JSON.stringify({ messages: [] }), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/profile') {
          return new Response(JSON.stringify(profileFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      const result = await source.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(result.messages).toHaveLength(0);
      expect(result.cursor).toBe('1005');
    });

    it('401 throws AuthError', async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        return new Response(JSON.stringify(error401Fixture), { status: 401 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      await expect(source.fetchInbox({ refreshToken: 'rt-test' }, 10)).rejects.toBeInstanceOf(
        AuthError,
      );
    });

    it('429 throws RateLimited with retryAfterMs', async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        return new Response(JSON.stringify(error429Fixture), {
          status: 429,
          headers: { 'Retry-After': '30' },
        });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      try {
        await source.fetchInbox({ refreshToken: 'rt-test' }, 10);
        throw new Error('Should have thrown RateLimited');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimited);
        expect((e as RateLimited).retryAfterMs).toBe(30000);
      }
    });

    it('messages.list sends labelIds=INBOX and the category exclusion query', async () => {
      let capturedQuery: string | null = null;
      let capturedLabelIds: string | null = null;
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname, searchParams } = new URL(url);
        if (pathname === '/gmail/v1/users/me/messages') {
          capturedQuery = searchParams.get('q');
          capturedLabelIds = searchParams.get('labelIds');
          return new Response(JSON.stringify({ messages: [] }), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/profile') {
          return new Response(JSON.stringify(profileFixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      await source.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(capturedLabelIds).toBe('INBOX');
      expect(capturedQuery).toBe('-category:promotions -category:social');
    });

    it('messages.get requests format=metadata with From, Subject and Date headers', async () => {
      let capturedFormat: string | null = null;
      let capturedHeaders: string[] = [];
      const fetchImpl = vi.fn(async (url: string) => {
        if (isTokenUrl(url)) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        const { pathname, searchParams } = new URL(url);
        if (pathname === '/gmail/v1/users/me/messages') {
          return new Response(JSON.stringify({ messages: [{ id: 'msg-1' }] }), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/messages/msg-1') {
          capturedFormat = searchParams.get('format');
          capturedHeaders = searchParams.getAll('metadataHeaders');
          return new Response(JSON.stringify(message1Fixture), { status: 200 });
        }
        if (pathname === '/gmail/v1/users/me/labels/INBOX') {
          return new Response(JSON.stringify(labelsInboxFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGmailSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://gmail.googleapis.com',
        fetchImpl,
      });

      await source.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(capturedFormat).toBe('metadata');
      expect(capturedHeaders).toEqual(['From', 'Subject', 'Date']);
    });
  });

  describe('toMessageHeader / decodeHtmlEntities', () => {
    it('decodes named and numeric HTML entities', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
      expect(decodeHtmlEntities('It&#39;s here')).toBe("It's here");
      expect(decodeHtmlEntities('&#x00a3;42')).toBe('£42');
      expect(decodeHtmlEntities('no entities here')).toBe('no entities here');
    });

    it('truncates the preview to at most 200 characters', () => {
      const snippet = 'x'.repeat(250);
      const header = toMessageHeader({
        id: 'msg-long',
        snippet,
        internalDate: '0',
        payload: { headers: [] },
      });
      expect(header.preview).toHaveLength(200);
    });

    it('parses a From header with no display name', () => {
      const header = toMessageHeader({
        id: 'msg-bare',
        internalDate: '0',
        payload: { headers: [{ name: 'From', value: 'bare@example.test' }] },
      });
      expect(header.fromName).toBeUndefined();
      expect(header.fromAddress).toBe('bare@example.test');
    });
  });

  describe('GoogleFake mail state', () => {
    it('addMessage makes a message appear in a full fetch and advances the cursor', async () => {
      const fake = new GoogleFake();
      fake.addMessage({
        id: 'new-msg',
        threadId: 'new-thread',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Welcome aboard',
        internalDate: '1759020000000',
        payload: { headers: [{ name: 'From', value: 'Team <team@example.test>' }] },
      });

      const result = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.providerMessageId).toBe('new-msg');
      expect(result.messages[0]!.unread).toBe(true);
      expect(result.cursor).toBe('1');
    });

    it('markRead clears the unread flag and drops the unread count', async () => {
      const fake = new GoogleFake();
      fake.addMessage({
        id: 'new-msg',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Welcome aboard',
        internalDate: '1759020000000',
        payload: { headers: [{ name: 'From', value: 'team@example.test' }] },
      });

      fake.markRead('new-msg');
      const result = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10);

      expect(result.messages[0]!.unread).toBe(false);
      expect(result.unreadTotal).toBe(0);
    });

    it('an incremental fetch after markRead returns that message as read, and not as a new one', async () => {
      const fake = new GoogleFake();
      fake.addMessage({
        id: 'm-1',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'hi',
        internalDate: '1',
        payload: { headers: [{ name: 'From', value: 'a@example.test' }] },
      });
      const first = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10);

      fake.markRead('m-1');
      const incremental = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10, first.cursor);

      expect(incremental.messages.map((m) => [m.providerMessageId, m.unread])).toEqual([
        ['m-1', false],
      ]);
      expect(fake.rawHistorySince(first.cursor!)).toEqual({
        addedIds: [],
        labelChangedIds: ['m-1'],
        historyId: incremental.cursor,
      });
    });

    it('an incremental fetch after addMessage only returns messages newer than the cursor', async () => {
      const fake = new GoogleFake();
      fake.addMessage({
        id: 'old-msg',
        labelIds: ['INBOX'],
        snippet: 'old',
        internalDate: '1',
        payload: { headers: [{ name: 'From', value: 'a@example.test' }] },
      });
      const first = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10);

      fake.addMessage({
        id: 'new-msg',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'new',
        internalDate: '2',
        payload: { headers: [{ name: 'From', value: 'b@example.test' }] },
      });

      const incremental = await fake.fetchInbox({ refreshToken: 'rt-test' }, 10, first.cursor);

      expect(incremental.full).toBe(false);
      expect(incremental.messages.map((m) => m.providerMessageId)).toEqual(['new-msg']);
    });

    it('revoke causes AuthError on a subsequent fetchInbox', async () => {
      const fake = new GoogleFake();
      await fake.revoke();

      await expect(fake.fetchInbox({ refreshToken: 'rt-test' }, 10)).rejects.toBeInstanceOf(
        AuthError,
      );
    });
  });
});

// CodeQL js/polynomial-redos (alert 9): the From header is sender-controlled, so parsing it must
// stay linear on crafted input.
describe('parseFrom', () => {
  it('splits a display name and an address, stripping quotes', () => {
    expect(parseFrom('"Ada Lovelace" <ada@example.test>')).toEqual({
      fromName: 'Ada Lovelace',
      fromAddress: 'ada@example.test',
    });
    expect(parseFrom('Ada <ada@example.test>')).toEqual({
      fromName: 'Ada',
      fromAddress: 'ada@example.test',
    });
    expect(parseFrom('<ada@example.test>')).toEqual({ fromAddress: 'ada@example.test' });
    expect(parseFrom('ada@example.test')).toEqual({ fromAddress: 'ada@example.test' });
  });

  it('stays linear on a crafted header', () => {
    const crafted = '<' + '<='.repeat(50_000);
    const started = performance.now();
    expect(parseFrom(crafted)).toEqual({ fromAddress: crafted });
    expect(performance.now() - started).toBeLessThan(200);
  });
});
