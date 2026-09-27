/**
 * CRLF-line and IMAP `{N}` literal reader over the `Socket` abstraction, shared by client.ts
 * (real IMAP talk) and fake-server.ts (the scripted server client.test.ts talks to). Buffers
 * across chunk boundaries; lines are decoded as plain ASCII, which is safe because every byte
 * in this protocol subset outside a literal's payload is 7-bit IMAP command/status grammar —
 * literal payload bytes are returned raw by `readExact` and decoded per-charset by the caller.
 */
import type { Socket } from './socket.js';

export function encodeAscii(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfCRLF(bytes: Uint8Array<ArrayBufferLike>): number {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) return i;
  }
  return -1;
}

export class LineReader {
  private buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  constructor(private readonly socket: Socket) {}

  private async fill(): Promise<boolean> {
    const chunk = await this.socket.read();
    if (chunk.length === 0) return false;
    this.buf = concatBytes(this.buf, chunk);
    return true;
  }

  /** Next CRLF-terminated line, with the CRLF stripped. */
  async readLine(): Promise<string> {
    for (;;) {
      const idx = indexOfCRLF(this.buf);
      if (idx >= 0) {
        const lineBytes = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 2);
        let line = '';
        for (const b of lineBytes) line += String.fromCharCode(b);
        return line;
      }
      if (!(await this.fill())) throw new Error('IMAP connection closed mid-line');
    }
  }

  /** Exactly `n` raw bytes (an IMAP literal's payload). */
  async readExact(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) {
      if (!(await this.fill())) throw new Error('IMAP connection closed mid-literal');
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }
}
