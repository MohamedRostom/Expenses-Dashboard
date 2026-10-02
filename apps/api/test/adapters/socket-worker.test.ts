// T046: proves createSocketWorkerConnect wires a Cloudflare `connect()`-shaped function into the
// Socket interface, without importing 'cloudflare:sockets' (there's no such module on Node —
// worker.ts is the only place that imports it, and passes it in as `cfConnect`).
import { describe, expect, it } from 'vitest';
import {
  createSocketWorkerConnect,
  type CloudflareConnect,
  type CloudflareSocket,
} from '../../src/adapters/socket-worker.js';

/** A fake `cloudflare:sockets` connect(): backs readable/writable with a TransformStream pair
 * that echoes writes as readable output when `echo` is true, or lets the test push arbitrary
 * bytes onto the readable side. */
function fakeCfConnect(opts: {
  onOpen?: (address: { hostname: string; port: number }, secure?: string) => void;
  push?: (write: (bytes: Uint8Array) => void) => void;
}): { connect: CloudflareConnect; closed: () => boolean } {
  let closed = false;
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const writer = toClient.writable.getWriter();
  const connect: CloudflareConnect = (address, options) => {
    opts.onOpen?.(address, options?.secureTransport);
    if (opts.push) opts.push((bytes) => void writer.write(bytes));
    const socket: CloudflareSocket = {
      readable: toClient.readable,
      writable: new WritableStream({
        write() {
          /* discard — this suite only asserts on the readable/close sides */
        },
      }),
      opened: Promise.resolve(),
      close: async () => {
        closed = true;
      },
    };
    return socket;
  };
  return { connect, closed: () => closed };
}

describe('createSocketWorkerConnect', () => {
  it('passes host/port and secureTransport through to cfConnect', async () => {
    let seenAddress: { hostname: string; port: number } | undefined;
    let seenSecure: string | undefined;
    const { connect } = fakeCfConnect({
      onOpen: (address, secure) => {
        seenAddress = address;
        seenSecure = secure;
      },
    });
    await createSocketWorkerConnect(connect)({ host: 'imap.example.com', port: 993, tls: true });
    expect(seenAddress).toEqual({ hostname: 'imap.example.com', port: 993 });
    expect(seenSecure).toBe('on');
  });

  it('secureTransport is off when tls is false', async () => {
    let seenSecure: string | undefined;
    const { connect } = fakeCfConnect({ onOpen: (_a, secure) => (seenSecure = secure) });
    await createSocketWorkerConnect(connect)({ host: 'h', port: 1, tls: false });
    expect(seenSecure).toBe('off');
  });

  it('read() surfaces bytes pushed onto the readable side', async () => {
    const { connect } = fakeCfConnect({
      push: (write) => write(new TextEncoder().encode('hi')),
    });
    const socket = await createSocketWorkerConnect(connect)({ host: 'h', port: 1, tls: true });
    const chunk = await socket.read();
    expect(new TextDecoder().decode(chunk)).toBe('hi');
  });

  it('close() closes the underlying cloudflare socket', async () => {
    const { connect, closed } = fakeCfConnect({});
    const socket = await createSocketWorkerConnect(connect)({ host: 'h', port: 1, tls: true });
    await socket.close();
    expect(closed()).toBe(true);
  });
});
