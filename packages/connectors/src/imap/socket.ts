/**
 * Runtime-agnostic TCP socket the IMAP client talks over (research.md R3). Node gets an
 * implementation on `node:tls`/`node:net` (`apps/api/src/adapters/socket-node.ts`), Workers on
 * `cloudflare:sockets` (`apps/api/src/adapters/socket-worker.ts`) — this package stays
 * Workers-compatible by depending only on this interface, never on either runtime's socket API.
 */

/** One TCP (optionally TLS) connection. `read()` resolves with the next available chunk, and
 * with a zero-length `Uint8Array` once the peer has closed the connection cleanly. */
export interface Socket {
  read(): Promise<Uint8Array>;
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectOptions {
  host: string;
  port: number;
  tls: boolean;
}

export type Connect = (options: ConnectOptions) => Promise<Socket>;
