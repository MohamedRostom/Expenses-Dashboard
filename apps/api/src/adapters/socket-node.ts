// T046: Stage 1 (Node/Fly) Socket adapter for the IMAP client (packages/connectors/src/imap).
// The only file in this repo allowed to import node:tls (CLAUDE.md/brief) — node:net covers the
// tls:false case, which real standards-based mail providers never use but a local test server
// can, without pulling in a certificate just to prove the wrapping works.
import { connect as netConnect, type Socket as NetSocket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import type { Connect, Socket } from '@desk/connectors/imap/socket';

type RawSocket = NetSocket | TLSSocket;

/** Wraps a Node net/tls socket's event-based API into the pull-based `read()` the IMAP client
 * wants: chunks arriving before a `read()` call are queued; a `read()` arriving before a chunk
 * waits for the next `data`/`end`/`error` event. Exported for imap-socket-integration.test.ts,
 * which wraps the *server* side of a real loopback net.Socket the same way. */
export function wrapNodeSocket(raw: RawSocket): Socket {
  const queued: Uint8Array[] = [];
  const waiting: Array<(chunk: Uint8Array) => void> = [];
  const failing: Array<(err: Error) => void> = [];
  let ended = false;
  let failure: Error | undefined;

  const settleEnd = () => {
    ended = true;
    while (waiting.length > 0) {
      const resolve = waiting.shift()!;
      failing.shift();
      resolve(new Uint8Array(0));
    }
  };
  const settleError = (err: Error) => {
    failure = err;
    ended = true;
    while (waiting.length > 0) {
      waiting.shift();
      const reject = failing.shift()!;
      reject(err);
    }
  };

  raw.on('data', (chunk: Buffer) => {
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const resolve = waiting.shift();
    if (resolve) {
      failing.shift();
      resolve(bytes);
    } else {
      queued.push(bytes);
    }
  });
  raw.on('end', settleEnd);
  raw.on('close', settleEnd);
  raw.on('error', settleError);

  return {
    read(): Promise<Uint8Array> {
      const next = queued.shift();
      if (next) return Promise.resolve(next);
      if (ended) return failure ? Promise.reject(failure) : Promise.resolve(new Uint8Array(0));
      return new Promise((resolve, reject) => {
        waiting.push(resolve);
        failing.push(reject);
      });
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

/** Real Node `Connect`: `node:tls` when the credential asks for TLS, plain `node:net` otherwise
 * (standards-based IMAP presets — Yahoo, iCloud, Fastmail — all use TLS; tls:false exists for a
 * local test/fake server). */
export const socketNodeConnect: Connect = ({ host, port, tls }) =>
  new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    const raw: RawSocket = tls
      ? tlsConnect({ host, port }, () => {
          raw.removeListener('error', onError);
          resolve(wrapNodeSocket(raw));
        })
      : netConnect({ host, port }, () => {
          raw.removeListener('error', onError);
          resolve(wrapNodeSocket(raw));
        });
    raw.once('error', onError);
  });
