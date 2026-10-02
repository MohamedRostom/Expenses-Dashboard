import { describe, expect, it, vi } from 'vitest';
import { createMicrosoftMailSource, toMessageHeader, type MicrosoftRawMessage } from './mail.js';
import { GraphFake } from './fake.js';
import { AuthError, ProviderError, RateLimited } from '../panels/index.js';
import page1 from './fixtures/mail/messages-full-page1.json';
import page2 from './fixtures/mail/messages-full-page2.json';
import deltaFixture from './fixtures/mail/messages-delta.json';
import syncStateNotFound from './fixtures/mail/error-syncStateNotFound.json';

const API = 'https://graph.microsoft.com';
const CURSOR = page2['@odata.deltaLink'];

type Route = (url: string) => Response | undefined;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** Token endpoint rotates the refresh token, as Microsoft does on every exchange. */
function stub(route: Route) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/oauth2/v2.0/token')) {
      return json({ access_token: 'at', refresh_token: 'rt-2' });
    }
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url) ?? json({ error: { code: 'notFound' } }, 404);
  }) as unknown as typeof fetch;
  const source = createMicrosoftMailSource({
    clientId: 'client',
    clientSecret: 'secret',
    apiBase: API,
    fetchImpl,
  });
  return { source, calls };
}

const fullInbox: Route = (url) => {
  if (url.includes('skiptoken')) return json(page2);
  if (url.includes('/mailFolders/inbox/messages/delta?')) return json(page1);
  return undefined;
};

const byId = <T extends { providerMessageId: string }>(xs: T[]) =>
  [...xs].sort((a, b) => a.providerMessageId.localeCompare(b.providerMessageId));

const cred = { refreshToken: 'rt-1' };

describe('Microsoft mail: real client against recorded fixtures', () => {
  it('full fetch follows nextLink, returns the deltaLink cursor and matches the fake', async () => {
    const { source, calls } = stub(fullInbox);

    const real = await source.fetchInbox(cred, 50);
    const fake = await new GraphFake().fetchInbox(cred, 50);

    expect(calls.map((c) => c.url)).toEqual([
      `${API}/v1.0/me/mailFolders/inbox/messages/delta?%24select=from%2Csubject%2CbodyPreview%2CreceivedDateTime%2CisRead%2CwebLink&%24top=50`,
      page1['@odata.nextLink'],
    ]);
    expect(real.full).toBe(true);
    expect(real.cursor).toBe(CURSOR);
    expect(real.messages).toHaveLength(page1.value.length + page2.value.length);
    expect(byId(real.messages)).toEqual(byId(fake.messages));
  });

  it('truncates a long bodyPreview to 200 characters', async () => {
    const { source } = stub(fullInbox);
    const { messages } = await source.fetchInbox(cred, 50);
    const long = messages.find((m) => m.providerMessageId === 'msg-1')!;
    expect(page1.value[0]!.bodyPreview.length).toBeGreaterThan(200);
    expect(long.preview).toHaveLength(200);
    expect(long.preview).toBe(page1.value[0]!.bodyPreview.slice(0, 200));
  });

  it('maps unread from isRead and omits fromName when Graph has none', async () => {
    const { source } = stub(fullInbox);
    const { messages } = await source.fetchInbox(cred, 50);
    const unread = messages.find((m) => m.providerMessageId === 'msg-1')!;
    const read = messages.find((m) => m.providerMessageId === 'msg-2')!;
    const noName = messages.find((m) => m.providerMessageId === 'msg-3')!;
    expect(unread.unread).toBe(true);
    expect(read.unread).toBe(false);
    expect(noName.fromName).toBeUndefined();
    expect(noName.fromAddress).toBe('security@example.test');
  });

  it('sends the bearer token and $select/$top on every Graph call', async () => {
    const { source, calls } = stub(fullInbox);
    await source.fetchInbox(cred, 50);
    for (const c of calls) {
      expect(c.headers['Authorization']).toBe('Bearer at');
    }
    expect(calls[0]!.url).toContain('%24top=50');
  });

  it('returns the rotated refresh token as rotatedCredential', async () => {
    const { source } = stub(fullInbox);
    const result = await source.fetchInbox(cred, 50);
    expect(result.rotatedCredential).toEqual({ refreshToken: 'rt-2' });
  });

  it('stops paging once the limit is reached', async () => {
    const { source, calls } = stub(fullInbox);
    const result = await source.fetchInbox(cred, 2);
    expect(result.messages).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('incremental fetch GETs the stored deltaLink, drops removed messages and reports nothing for them', async () => {
    const { source, calls } = stub((url) => (url === CURSOR ? json(deltaFixture) : undefined));

    const result = await source.fetchInbox(cred, 50, CURSOR);

    expect(calls.map((c) => c.url)).toEqual([CURSOR]);
    expect(result.full).toBe(false);
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['msg-delta-new']);
    expect(result.cursor).toBe(deltaFixture['@odata.deltaLink']);
    expect((result as { deletedIds?: unknown }).deletedIds).toBeUndefined();
  });

  it('syncStateNotFound on the cursor refetches the full inbox', async () => {
    const { source, calls } = stub((url) =>
      url === CURSOR ? json(syncStateNotFound, 400) : fullInbox(url),
    );

    const result = await source.fetchInbox(cred, 50, CURSOR);

    expect(calls[0]!.url).toBe(CURSOR);
    expect(calls[1]!.url).toContain('/mailFolders/inbox/messages/delta?');
    expect(result.full).toBe(true);
    expect(result.cursor).toBe(CURSOR);
  });

  it('410 on the cursor refetches the full inbox', async () => {
    const { source } = stub((url) => (url === CURSOR ? json({}, 410) : fullInbox(url)));
    const result = await source.fetchInbox(cred, 50, CURSOR);
    expect(result.full).toBe(true);
    expect(result.messages).toHaveLength(page1.value.length + page2.value.length);
  });

  it('401 throws AuthError', async () => {
    const { source } = stub(() => json({ error: { code: 'InvalidAuthenticationToken' } }, 401));
    await expect(source.fetchInbox(cred, 50)).rejects.toBeInstanceOf(AuthError);
  });

  it('429 throws RateLimited with Retry-After in milliseconds', async () => {
    const { source } = stub(() => json({}, 429, { 'Retry-After': '30' }));
    const err = await source.fetchInbox(cred, 50).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimited);
    expect((err as RateLimited).retryAfterMs).toBe(30_000);
  });

  it('other failures throw ProviderError carrying only the status', async () => {
    const { source } = stub(() => json({ error: { message: 'secret detail' } }, 503));
    const err = await source.fetchInbox(cred, 50).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toBe('graph mail 503');
  });
});

describe('toMessageHeader', () => {
  const base: MicrosoftRawMessage = {
    id: 'msg-x',
    subject: 'Hello',
    bodyPreview: 'A short preview',
    receivedDateTime: '2026-10-01T09:00:00Z',
    isRead: false,
  };

  it('keeps fromAddress and marks unread when isRead is false', () => {
    const header = toMessageHeader({
      ...base,
      from: { emailAddress: { name: 'A Sender', address: 'a@example.test' } },
      webLink: 'https://outlook.test/x',
    });
    expect(header).toEqual({
      providerMessageId: 'msg-x',
      fromName: 'A Sender',
      fromAddress: 'a@example.test',
      subject: 'Hello',
      preview: 'A short preview',
      receivedAt: new Date('2026-10-01T09:00:00Z'),
      unread: true,
      link: 'https://outlook.test/x',
    });
  });

  it('marks read when isRead is true', () => {
    const header = toMessageHeader({
      ...base,
      isRead: true,
      from: { emailAddress: { address: 'a@example.test' } },
    });
    expect(header.unread).toBe(false);
  });
});

describe('GraphFake mail', () => {
  it('adds a message and reports it unread by default', async () => {
    const fake = new GraphFake();
    fake.addMessage({
      id: 'msg-added',
      subject: 'New',
      bodyPreview: 'preview',
      receivedDateTime: '2026-10-10T00:00:00Z',
      isRead: false,
      from: { emailAddress: { address: 'x@example.test' } },
    });
    const { messages } = await fake.fetchInbox(cred, 50);
    const added = messages.find((m) => m.providerMessageId === 'msg-added');
    expect(added?.unread).toBe(true);
  });

  it('markRead flips a message to read', async () => {
    const fake = new GraphFake();
    fake.addMessage({
      id: 'msg-toread',
      subject: 'New',
      bodyPreview: 'preview',
      receivedDateTime: '2026-10-10T00:00:00Z',
      isRead: false,
      from: { emailAddress: { address: 'x@example.test' } },
    });
    fake.markRead('msg-toread');
    const { messages } = await fake.fetchInbox(cred, 50);
    const read = messages.find((m) => m.providerMessageId === 'msg-toread');
    expect(read?.unread).toBe(false);
  });

  it('throws AuthError on every call after revoke', async () => {
    const fake = new GraphFake();
    await fake.revoke();
    await expect(fake.fetchInbox(cred, 50)).rejects.toBeInstanceOf(AuthError);
  });
});
