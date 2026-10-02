// T039/T046/T047: proves ImapMailSource (packages/connectors) actually works over both real
// Socket implementations — socket-node's real loopback TCP connection, and socket-worker's
// connect() shim — not just over the in-memory pair client.test.ts uses. Lives in apps/api
// (not packages/connectors) because only apps/api may depend on the socket-node/socket-worker
// adapters; packages/connectors must stay Workers-compatible and never import them.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ImapMailSource, type ImapCredential } from '@desk/connectors/imap/client';
import { parseTranscript, serveTranscript } from '@desk/connectors/imap/fake-server';
import type { Socket } from '@desk/connectors/imap/socket';
import { socketNodeConnect, wrapNodeSocket } from '../src/adapters/socket-node.js';
import {
  createSocketWorkerConnect,
  type CloudflareConnect,
  type CloudflareSocket,
} from '../src/adapters/socket-worker.js';

const CRED: ImapCredential = {
  host: '127.0.0.1',
  port: 0, // overwritten per test with the loopback server's actual port
  tls: false,
  username: 'alice@example.com',
  password: 'app-password',
};

function fixture(name: string): string {
  return readFileSync(
    new URL(`../../../packages/connectors/src/imap/fixtures/${name}`, import.meta.url),
    'utf-8',
  );
}

describe('ImapMailSource over socket-node (real loopback TCP)', () => {
  it('fetches the happy-path inbox over a real TCP connection', async () => {
    const exchanges = parseTranscript(fixture('session.txt'));
    const server = createServer((conn) => {
      void serveTranscript(wrapNodeSocket(conn), exchanges);
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr === null || typeof addr === 'string') throw new Error('expected AddressInfo');
        resolve(addr.port);
      });
    });
    try {
      const source = new ImapMailSource(socketNodeConnect);
      const result = await source.fetchInbox({ ...CRED, port }, 50);
      expect(result.messages.map((m) => m.providerMessageId)).toEqual(['103', '102']);
      expect(result.unreadTotal).toBe(1);
      expect(result.cursor).toBe('1000001:104');
    } finally {
      server.close();
    }
  });
});

describe('ImapMailSource over socket-worker (cloudflare:sockets shim)', () => {
  it('fetches the happy-path inbox over the Workers connect() shim', async () => {
    const exchanges = parseTranscript(fixture('session.txt'));

    // Two TransformStreams back-to-back give a duplex pipe without a real socket, standing in
    // for what cloudflare:sockets' connect() would return.
    const toServer = new TransformStream<Uint8Array, Uint8Array>();
    const toClient = new TransformStream<Uint8Array, Uint8Array>();
    const clientSocket: CloudflareSocket = {
      readable: toClient.readable,
      writable: toServer.writable,
      opened: Promise.resolve(),
      // socket-worker.ts's wrap() already closes its own writer (acquired once from
      // `raw.writable`) before calling this — nothing left for the "real" close to do here.
      close: async () => {},
    };
    // getReader()/getWriter() lock the stream for its lifetime — acquire each once and reuse it,
    // the same way socket-worker.ts's own wrap() does, instead of re-locking per call.
    const serverReader = toServer.readable.getReader();
    const serverWriter = toClient.writable.getWriter();
    const serverSocket: Socket = {
      read: async () => {
        const { value, done } = await serverReader.read();
        return done || !value ? new Uint8Array(0) : value;
      },
      write: async (bytes) => {
        await serverWriter.write(bytes);
      },
      close: async () => {
        await serverWriter.close();
      },
    };
    void serveTranscript(serverSocket, exchanges);

    const cfConnect: CloudflareConnect = () => clientSocket;
    const source = new ImapMailSource(createSocketWorkerConnect(cfConnect));
    const result = await source.fetchInbox(CRED, 50);
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['103', '102']);
    expect(result.unreadTotal).toBe(1);
    expect(result.cursor).toBe('1000001:104');
  });
});
