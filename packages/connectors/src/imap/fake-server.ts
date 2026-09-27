/**
 * Scripted in-memory IMAP server for client.test.ts (T039/T047). Replays a hand-authored
 * transcript (packages/connectors/src/imap/fixtures/*.txt) over a pair of in-memory `Socket`s —
 * no real TCP, so it runs identically against the client wired to socket-node or socket-worker.
 *
 * ponytail: supports exactly the command subset client.ts speaks — LOGIN, SELECT INBOX,
 * SEARCH UNSEEN, UID SEARCH ALL, UID FETCH (FLAGS INTERNALDATE BODYSTRUCTURE), UID FETCH
 * (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)]), UID FETCH (BODY.PEEK[<n>]<0.200>) and LOGOUT
 * (research.md R3, contracts/providers.md) — in the order given by the transcript. It is not a
 * general IMAP server: an unexpected command throws instead of improvising a response.
 */
import type { Socket } from './socket.js';
import { LineReader, encodeAscii } from './line-reader.js';

/** One command/response exchange parsed from a transcript. */
export interface Exchange {
  /** Client command text, without the tag (e.g. "SELECT INBOX"). */
  command: string;
  /** Untagged (`*`) lines to send back, in order, before the tagged completion. */
  untagged: Array<{ line: string } | { literalPrefix: string; literalContent: string }>;
  /** Tagged completion text, without the tag (e.g. "OK LOGIN completed"). */
  taggedText: string;
}

/**
 * Parses the small transcript DSL used by fixtures/*.txt:
 *   C <command>              — expected client command
 *   U <untagged line>        — verbatim untagged response line (starts with "*")
 *   L <untagged line prefix> — untagged response line whose last atom is an IMAP literal;
 *     followed by the literal's raw content lines, then a line containing only ")" to close
 *     the response. The server computes and inserts the literal's `{N}` byte count itself, so
 *     the fixture never has to hand-count bytes.
 *   S <tagged completion>    — tagged completion text
 * Blank lines and lines starting with "#" are ignored between exchanges.
 */
export function parseTranscript(text: string): Exchange[] {
  const lines = text.split(/\r?\n/);
  const exchanges: Exchange[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() === '' || line.startsWith('#')) {
      i++;
      continue;
    }
    if (!line.startsWith('C ')) throw new Error(`fixture: expected "C " line, got: ${line}`);
    const command = line.slice(2);
    i++;
    const untagged: Exchange['untagged'] = [];
    while (i < lines.length && (lines[i]!.startsWith('U ') || lines[i]!.startsWith('L '))) {
      const l = lines[i]!;
      if (l.startsWith('U ')) {
        untagged.push({ line: l.slice(2) });
        i++;
        continue;
      }
      const literalPrefix = l.slice(2);
      i++;
      const content: string[] = [];
      while (i < lines.length && lines[i] !== ')') {
        content.push(lines[i]!);
        i++;
      }
      if (lines[i] !== ')') throw new Error(`fixture: literal block never closed with ")"`);
      i++; // consume ")"
      untagged.push({ literalPrefix, literalContent: content.join('\r\n') });
    }
    if (i >= lines.length || !lines[i]!.startsWith('S ')) {
      throw new Error(`fixture: expected "S " line after command: ${command}`);
    }
    const taggedText = lines[i]!.slice(2);
    i++;
    exchanges.push({ command, untagged, taggedText });
  }
  return exchanges;
}

/** Plays `exchanges` on `socket` (the server side of a pair): reads the client's tagged command,
 * checks it matches, sends the scripted untagged/literal lines, then the tagged completion
 * echoing the client's own tag. Throws if the client sends something not in the script. */
export async function serveTranscript(socket: Socket, exchanges: Exchange[]): Promise<void> {
  const reader = new LineReader(socket);
  let index = 0;
  while (index < exchanges.length) {
    const line = await reader.readLine();
    const spaceIdx = line.indexOf(' ');
    const tag = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1);
    let exchange = exchanges[index]!;
    if (rest !== exchange.command) {
      // A fixture documents every exchange a full run could reach, but a client capped by
      // `limit` may stop fetching early and jump straight to LOGOUT — find the later exchange
      // that matches and resume there instead of failing the whole script.
      const jumpIndex = exchanges.findIndex((e, i) => i > index && e.command === rest);
      if (jumpIndex === -1) {
        throw new Error(`fake-server: expected command "${exchange.command}", got "${rest}"`);
      }
      index = jumpIndex;
      exchange = exchanges[jumpIndex]!;
    }
    for (const u of exchange.untagged) {
      if ('line' in u) {
        await socket.write(encodeAscii(`${u.line}\r\n`));
      } else {
        const literalBytes = encodeAscii(u.literalContent);
        await socket.write(encodeAscii(`${u.literalPrefix} {${literalBytes.length}}\r\n`));
        await socket.write(literalBytes);
        await socket.write(encodeAscii(')\r\n'));
      }
    }
    await socket.write(encodeAscii(`${tag} ${exchange.taggedText}\r\n`));
    index++;
  }
}

/** One end of an in-memory duplex byte pipe: `write`s on one side arrive from `read` on the
 * other. Used to hand the IMAP client a `Socket` whose peer is `serveTranscript`, with no real
 * TCP involved — the same client code then runs unmodified against socket-node or
 * socket-worker's real implementations. */
function createPipe(): {
  read(): Promise<Uint8Array>;
  write(bytes: Uint8Array): void;
  end(): void;
} {
  const queued: Uint8Array[] = [];
  const waiting: Array<(chunk: Uint8Array) => void> = [];
  let ended = false;
  return {
    write(bytes: Uint8Array) {
      const resolve = waiting.shift();
      if (resolve) resolve(bytes);
      else queued.push(bytes);
    },
    read(): Promise<Uint8Array> {
      const next = queued.shift();
      if (next) return Promise.resolve(next);
      if (ended) return Promise.resolve(new Uint8Array(0));
      return new Promise((resolve) => waiting.push(resolve));
    },
    end() {
      ended = true;
      while (waiting.length > 0) waiting.shift()!(new Uint8Array(0));
    },
  };
}

/** A connected pair of in-memory `Socket`s: whatever is written to one is read from the other. */
export function createSocketPair(): [Socket, Socket] {
  const aToB = createPipe();
  const bToA = createPipe();
  const a: Socket = {
    read: () => bToA.read(),
    write: async (bytes) => aToB.write(bytes),
    close: async () => aToB.end(),
  };
  const b: Socket = {
    read: () => aToB.read(),
    write: async (bytes) => bToA.write(bytes),
    close: async () => bToA.end(),
  };
  return [a, b];
}
