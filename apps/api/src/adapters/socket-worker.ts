// T046: Stage 2 (Cloudflare Workers) Socket adapter for the IMAP client. Same pattern as
// session-store-kv.ts's KVNamespace: declare only the slice of `cloudflare:sockets` this file
// needs as a local interface, instead of importing that module (no ambient types in this repo,
// no new @cloudflare/workers-types dependency) or adding a Workers-only import that would break
// typecheck/tests on Node. worker.ts does `import { connect } from 'cloudflare:sockets'` and
// passes it into `createSocketWorkerConnect`, so this file — and its tests — never touch that
// module directly.
import type { Connect, Socket } from '@desk/connectors/imap/socket';

/** Minimal shape of the object `cloudflare:sockets`' `connect()` returns. */
export interface CloudflareSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  close(): Promise<void>;
}

export type CloudflareConnect = (
  address: { hostname: string; port: number },
  options?: { secureTransport?: 'on' | 'off' | 'starttls' },
) => CloudflareSocket;

function wrap(raw: CloudflareSocket): Socket {
  const reader = raw.readable.getReader();
  const writer = raw.writable.getWriter();
  return {
    async read(): Promise<Uint8Array> {
      const { value, done } = await reader.read();
      return done || !value ? new Uint8Array(0) : value;
    },
    async write(bytes: Uint8Array): Promise<void> {
      await writer.write(bytes);
    },
    async close(): Promise<void> {
      try {
        await writer.close();
      } catch {
        // already closed by the peer — fine, we're closing anyway
      }
      await raw.close();
    },
  };
}

/** Builds the Workers `Connect`. `cfConnect` is the real `connect` from `cloudflare:sockets`
 * in production (worker.ts), or a test shim over an in-memory ReadableStream/WritableStream
 * pair. */
export function createSocketWorkerConnect(cfConnect: CloudflareConnect): Connect {
  return async ({ host, port, tls }) => {
    const raw = cfConnect({ hostname: host, port }, { secureTransport: tls ? 'on' : 'off' });
    await raw.opened;
    return wrap(raw);
  };
}
