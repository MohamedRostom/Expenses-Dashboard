// Types for the Workers runtime module worker.ts imports, matching CloudflareConnect in
// adapters/socket-worker.ts (no @cloudflare/workers-types dependency).
declare module 'cloudflare:sockets' {
  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: 'on' | 'off' | 'starttls' },
  ): {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    close(): Promise<void>;
  };
}
