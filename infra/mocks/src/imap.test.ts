// T052: ImapMailSource (the real client, packages/connectors/src/imap/client.ts) driven over a
// real loopback TCP connection to infra/mocks/src/imap.ts's dynamic IMAP server — proving the
// server speaks exactly the grammar the client parses (see apps/api/test/imap-socket-integration.test.ts
// for the equivalent proof against the scripted fake-server.ts transcript).
import { describe, expect, it } from 'vitest';
import { connect as netConnect, type Socket as NetSocket, type AddressInfo } from 'node:net';
import { ImapMailSource, type ImapCredential } from '@desk/connectors/imap/client';
import type { Connect, Socket } from '@desk/connectors/imap/socket';
import { createImapMockApp, createImapStore, startImapMockServer } from './imap.js';

/** Wraps a Node net.Socket's event-based API into the pull-based `read()` ImapMailSource wants —
 * a small, test-local duplicate of apps/api/src/adapters/socket-node.ts's wrapNodeSocket (that
 * file belongs to apps/api, which infra/mocks doesn't depend on). */
function wrapNetSocket(raw: NetSocket): Socket {
  const queued: Uint8Array[] = [];
  const waiting: Array<(chunk: Uint8Array) => void> = [];
  let ended = false;

  raw.on('data', (chunk: Buffer) => {
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const resolve = waiting.shift();
    if (resolve) resolve(bytes);
    else queued.push(bytes);
  });
  const settleEnd = () => {
    ended = true;
    while (waiting.length > 0) waiting.shift()!(new Uint8Array(0));
  };
  raw.on('end', settleEnd);
  raw.on('close', settleEnd);

  return {
    read(): Promise<Uint8Array> {
      const next = queued.shift();
      if (next) return Promise.resolve(next);
      if (ended) return Promise.resolve(new Uint8Array(0));
      return new Promise((resolve) => waiting.push(resolve));
    },
    write(bytes: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        raw.write(bytes, (err) => (err ? reject(err) : resolve()));
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => raw.end(() => resolve()));
    },
  };
}

const testConnect: Connect = ({ host, port }) =>
  new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    const raw = netConnect({ host, port }, () => {
      raw.removeListener('error', onError);
      resolve(wrapNetSocket(raw));
    });
    raw.once('error', onError);
  });

async function startServer() {
  const store = createImapStore();
  const server = startImapMockServer(0, store);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, store, port };
}

function credFor(port: number, username: string, password = 'app-password'): ImapCredential {
  return { host: '127.0.0.1', port, tls: false, username, password };
}

describe('IMAP mock (T052)', () => {
  it('control add: a message added via the control route appears in fetchInbox', async () => {
    const { server, store, port } = await startServer();
    const controlApp = createImapMockApp(store);
    try {
      await controlApp.request('/__control/imap/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'alice@example.test',
          action: 'add',
          message: {
            from: 'Bob <bob@example.test>',
            subject: 'Hi',
            body: 'Hello there',
            date: '2026-09-28T09:00:00Z',
          },
        }),
      });

      const source = new ImapMailSource(testConnect);
      const result = await source.fetchInbox(credFor(port, 'alice@example.test'), 10);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.subject).toBe('Hi');
      expect(result.messages[0]!.fromAddress).toBe('bob@example.test');
      expect(result.messages[0]!.fromName).toBe('Bob');
      expect(result.messages[0]!.preview).toBe('Hello there');
      expect(result.messages[0]!.unread).toBe(true);
      expect(result.unreadTotal).toBe(1);
    } finally {
      server.close();
    }
  });

  it('markRead drops the message from unread and unreadTotal', async () => {
    const { server, store, port } = await startServer();
    const controlApp = createImapMockApp(store);
    try {
      await controlApp.request('/__control/imap/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'alice@example.test',
          action: 'add',
          message: {
            from: 'bob@example.test',
            subject: 'Hi',
            body: 'Hello',
            date: '2026-09-28T09:00:00Z',
          },
        }),
      });

      const source = new ImapMailSource(testConnect);
      const before = await source.fetchInbox(credFor(port, 'alice@example.test'), 10);
      expect(before.unreadTotal).toBe(1);
      const uid = Number(before.messages[0]!.providerMessageId);

      await controlApp.request('/__control/imap/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'alice@example.test', action: 'markRead', uid }),
      });

      const after = await source.fetchInbox(credFor(port, 'alice@example.test'), 10);
      expect(after.unreadTotal).toBe(0);
      expect(after.messages[0]!.unread).toBe(false);
    } finally {
      server.close();
    }
  });

  it('wrong password fails LOGIN', async () => {
    const { server, port } = await startServer();
    try {
      const source = new ImapMailSource(testConnect);
      await expect(
        source.verify(credFor(port, 'alice@example.test', 'wrong-password')),
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });

  it('isolation: two usernames never see each other messages', async () => {
    const { server, store, port } = await startServer();
    const controlApp = createImapMockApp(store);
    try {
      await controlApp.request('/__control/imap/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'alice@example.test',
          action: 'add',
          message: {
            from: 'x@example.test',
            subject: 'Only Alice',
            body: 'x',
            date: '2026-09-28T09:00:00Z',
          },
        }),
      });

      const source = new ImapMailSource(testConnect);
      const aliceResult = await source.fetchInbox(credFor(port, 'alice@example.test'), 10);
      const bobResult = await source.fetchInbox(credFor(port, 'bob@example.test'), 10);

      expect(aliceResult.messages).toHaveLength(1);
      expect(bobResult.messages).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
