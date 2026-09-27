// T046: proves socket-node.ts wraps a real Node TCP connection into the Socket interface.
// A real local TLS test needs a certificate (a new dependency), so this exercises tls:false
// (plain node:net) against a real loopback net.createServer — the wrapping logic (queueing,
// end-of-stream, error propagation) is identical for the TLS branch, which differs only in
// which node: connect function is called.
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { socketNodeConnect } from '../../src/adapters/socket-node.js';

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') throw new Error('expected AddressInfo');
      resolve(addr.port);
    });
  });
}

describe('socketNodeConnect', () => {
  it('reads bytes written by the peer, in order, across multiple writes', async () => {
    const server = createServer((conn) => {
      conn.write('hello ');
      conn.write('world');
    });
    const port = await listen(server);
    try {
      const socket = await socketNodeConnect({ host: '127.0.0.1', port, tls: false });
      const chunks: Uint8Array[] = [];
      let text = '';
      while (text.length < 'hello world'.length) {
        const chunk = await socket.read();
        chunks.push(chunk);
        text += Buffer.from(chunk).toString('utf-8');
      }
      expect(text).toBe('hello world');
      await socket.close();
    } finally {
      server.close();
    }
  });

  it('write() delivers bytes to the peer', async () => {
    const received = new Promise<string>((resolve) => {
      const server = createServer((conn) => {
        conn.once('data', (d: Buffer) => {
          resolve(d.toString('utf-8'));
          conn.end();
          server.close();
        });
      });
      void listen(server).then(async (port) => {
        const socket = await socketNodeConnect({ host: '127.0.0.1', port, tls: false });
        await socket.write(new TextEncoder().encode('ping'));
      });
    });
    expect(await received).toBe('ping');
  });

  it('read() resolves with an empty chunk once the peer closes the connection', async () => {
    const server = createServer((conn) => {
      conn.end();
    });
    const port = await listen(server);
    try {
      const socket = await socketNodeConnect({ host: '127.0.0.1', port, tls: false });
      const chunk = await socket.read();
      expect(chunk.length).toBe(0);
      await socket.close();
    } finally {
      server.close();
    }
  });

  it('connect() rejects when nothing is listening on the port', async () => {
    await expect(socketNodeConnect({ host: '127.0.0.1', port: 1, tls: false })).rejects.toThrow();
  });
});
