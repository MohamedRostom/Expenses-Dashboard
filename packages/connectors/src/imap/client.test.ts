// T039/T047: the client against fixtures/*.txt replayed by the scripted fake-server, both ends
// talking over createSocketPair()'s in-memory duplex (the same Socket interface socket-node and
// socket-worker implement — see apps/api/test/imap-socket-integration.test.ts for the client
// proved end to end over a real loopback socket-node connection and over socket-worker's shim,
// since packages/connectors must not depend on apps/api's adapters).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuthError, VerificationError, type MailSource } from '../panels/index.js';
import { ImapMailSource, type ImapCredential } from './client.js';
import { createSocketPair, parseTranscript, serveTranscript } from './fake-server.js';
import type { Connect } from './socket.js';

const CRED: ImapCredential = {
  host: 'imap.example.com',
  port: 993,
  tls: true,
  username: 'alice@example.com',
  password: 'app-password',
};

function fixture(name: string): string {
  const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
  return readFileSync(`${dir}${name}`, 'utf-8');
}

/** Wires an ImapMailSource whose Connect ignores host/port/tls and hands back one end of a
 * fresh in-memory socket pair, while the fake server plays `transcript` on the other end. */
function harness(transcriptName: string): { source: MailSource; served: Promise<void> } {
  const [clientSocket, serverSocket] = createSocketPair();
  const connect: Connect = () => Promise.resolve(clientSocket);
  const exchanges = parseTranscript(fixture(transcriptName));
  const served = serveTranscript(serverSocket, exchanges);
  return { source: new ImapMailSource(connect), served };
}

describe('ImapMailSource.fetchInbox', () => {
  it('returns the newest headers, decoded, with cursor and unreadTotal (happy path)', async () => {
    const { source, served } = harness('session.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;

    expect(result.full).toBe(true);
    expect(result.unreadTotal).toBe(1);
    expect(result.cursor).toBe('1000001:104');
    expect(result.messages).toHaveLength(2);

    // newest first: UID 103 before UID 102
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['103', '102']);

    const [first, second] = result.messages;
    expect(first).toMatchObject({
      fromName: 'Bob',
      fromAddress: 'bob@example.com',
      subject: 'Lunch tomorrow?',
      unread: false,
      preview: 'Hey, are you free for lunch tomorrow at noon?',
    });
    expect(first!.receivedAt.toISOString()).toBe('2026-01-03T09:15:00.000Z');

    expect(second).toMatchObject({
      fromName: 'Carol',
      fromAddress: 'carol@example.com',
      subject: 'Invoice #204',
      unread: true,
      preview: 'Please find attached invoice 204 for January.',
    });
  });

  it('respects limit: only the newest `limit` UIDs are fetched', async () => {
    const { source, served } = harness('session.txt');
    const result = await source.fetchInbox(CRED, 1);
    await served;
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.providerMessageId).toBe('103');
  });

  it('full is false when the cursor UIDVALIDITY still matches', async () => {
    const { source, served } = harness('session.txt');
    const result = await source.fetchInbox(CRED, 50, '1000001:100');
    await served;
    expect(result.full).toBe(false);
  });

  it('full is true when the cursor UIDVALIDITY changed (mailbox rebuilt)', async () => {
    const { source, served } = harness('changed-uidvalidity.txt');
    const result = await source.fetchInbox(CRED, 50, '1000001:104');
    await served;
    expect(result.full).toBe(true);
    expect(result.cursor).toBe('1000002:201');
  });

  it('empty inbox: no messages, unreadTotal 0, still full on first fetch', async () => {
    const { source, served } = harness('empty-inbox.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages).toEqual([]);
    expect(result.unreadTotal).toBe(0);
    expect(result.full).toBe(true);
  });

  it('multipart/alternative: picks the text/plain part over text/html', async () => {
    const { source, served } = harness('multipart-alternative.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages[0]!.preview).toBe('Plain text alternative wins over the HTML part.');
  });

  it('base64-encoded text/plain body is decoded for the preview', async () => {
    const { source, served } = harness('base64-plain.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages[0]!.preview).toBe('Base64 encoded body content here.');
  });

  it('quoted-printable ISO-8859-1 body decodes accented characters', async () => {
    const { source, served } = harness('quoted-printable-iso-8859-1.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages[0]!.preview).toBe('Café résumé attached.');
  });

  it('HTML-only body strips tags and collapses whitespace', async () => {
    const { source, served } = harness('html-only.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages[0]!.preview).toBe('Hello world, this is HTML.');
  });

  it('RFC 2047 encoded From and Subject are decoded', async () => {
    const { source, served } = harness('rfc2047-encoded.txt');
    const result = await source.fetchInbox(CRED, 50);
    await served;
    expect(result.messages[0]).toMatchObject({
      fromName: 'François',
      fromAddress: 'francois@example.com',
      subject: 'Réunion café',
    });
  });

  it('wrong password: fetchInbox throws AuthError', async () => {
    const { source, served } = harness('wrong-password.txt');
    await expect(source.fetchInbox(CRED, 50)).rejects.toThrow(AuthError);
    await served;
  });
});

describe('ImapMailSource.verify', () => {
  it('succeeds when LOGIN and SELECT INBOX both succeed', async () => {
    const { source, served } = harness('verify-only.txt');
    await expect(source.verify(CRED)).resolves.toBeUndefined();
    await served;
  });

  it('throws VerificationError{step:"login"} when LOGIN fails', async () => {
    const { source, served } = harness('wrong-password.txt');
    const err = await source.verify(CRED).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).step).toBe('login');
    await served;
  });

  it('throws VerificationError{step:"inbox"} when SELECT INBOX fails', async () => {
    const { source, served } = harness('select-failure.txt');
    const err = await source.verify(CRED).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).step).toBe('inbox');
    await served;
  });
});

describe('ImapMailSource.revoke', () => {
  it('is a no-op', async () => {
    const { source } = harness('session.txt');
    await expect(source.revoke(CRED)).resolves.toBeUndefined();
  });
});
