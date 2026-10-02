/**
 * Minimal read-only IMAP `MailSource` (research.md R3, contracts/providers.md "Standards
 * (IMAP)"). Speaks exactly the command subset the fake server and fixtures/*.txt exercise:
 * LOGIN, SELECT INBOX, SEARCH UNSEEN, UID SEARCH ALL, UID FETCH (FLAGS INTERNALDATE
 * BODYSTRUCTURE), UID FETCH (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)]), UID FETCH
 * (BODY.PEEK[<n>]<0.200>) and LOGOUT — one connection per refresh, closed with LOGOUT.
 *
 * ponytail: BODYSTRUCTURE here is a minimal (type, subtype, charset, encoding) tuple tree, not
 * the full RFC 3501 grammar (no body ids, line/byte counts, disposition, language, location) —
 * enough to walk to the first text/plain (else text/html) part, which is all the preview needs.
 * Upgrade to the full grammar if this client is ever pointed at a server whose BODYSTRUCTURE
 * this parser can't already read (it wasn't designed to be — see fake-server.ts).
 */
import type { Connect, Socket } from './socket.js';
import { LineReader, encodeAscii } from './line-reader.js';
import type { MailSource, MessageHeader } from '../panels/index.js';
import { AuthError, VerificationError } from '../panels/index.js';

export interface ImapCredential {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
}

/** Raised internally by the tagged-command helpers on a NO/BAD response; fetchInbox and verify
 * each translate it into the error type their contract promises (AuthError / VerificationError). */
class ImapCommandError extends Error {
  override name = 'ImapCommandError';
}

class ImapProtocolError extends Error {
  override name = 'ImapProtocolError';
}

// ---------------------------------------------------------------------------------------------
// BODYSTRUCTURE: tokenizer + s-expression parser + the walk to the first text part.
// ---------------------------------------------------------------------------------------------

type Token = '(' | ')' | string;

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '(' || c === ')') {
      tokens.push(c);
      i++;
      continue;
    }
    if (c === ' ') {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j++;
      tokens.push(s.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== ' ' && s[j] !== '(' && s[j] !== ')') j++;
    tokens.push(s.slice(i, j));
    i = j;
  }
  return tokens;
}

type SExpr = string | SExpr[];

function parseSexpr(tokens: Token[], pos: { i: number }): SExpr {
  if (tokens[pos.i] !== '(') throw new ImapProtocolError(`BODYSTRUCTURE: expected "("`);
  pos.i++;
  const items: SExpr[] = [];
  while (tokens[pos.i] !== ')') {
    if (pos.i >= tokens.length) throw new ImapProtocolError('BODYSTRUCTURE: unbalanced parens');
    items.push(tokens[pos.i] === '(' ? parseSexpr(tokens, pos) : tokens[pos.i++]!);
  }
  pos.i++; // consume ")"
  return items;
}

export type BodyStructure =
  | {
      kind: 'leaf';
      type: string;
      subtype: string;
      charset?: string;
      encoding: string;
      partNum: number;
    }
  | { kind: 'multipart'; subtype: string; children: BodyStructure[] };

function toBodyStructure(node: SExpr, counter: { n: number }): BodyStructure {
  if (typeof node === 'string') throw new ImapProtocolError('BODYSTRUCTURE: expected a list');
  const last = node[node.length - 1];
  const rest = node.slice(0, -1);
  const isMultipart =
    rest.length > 0 && rest.every((x) => Array.isArray(x)) && typeof last === 'string';
  if (isMultipart) {
    return {
      kind: 'multipart',
      subtype: last as string,
      children: rest.map((child) => toBodyStructure(child, counter)),
    };
  }
  const [type, subtype, charset, encoding] = node as string[];
  if (!type || !subtype || !encoding)
    throw new ImapProtocolError(`BODYSTRUCTURE: malformed leaf: ${JSON.stringify(node)}`);
  counter.n += 1;
  const leaf: Extract<BodyStructure, { kind: 'leaf' }> = {
    kind: 'leaf',
    type: type.toUpperCase(),
    subtype: subtype.toUpperCase(),
    encoding: encoding.toUpperCase(),
    partNum: counter.n,
  };
  if (charset && charset !== 'NIL') leaf.charset = charset;
  return leaf;
}

function parseBodyStructure(text: string): BodyStructure {
  return toBodyStructure(parseSexpr(tokenize(text), { i: 0 }), { n: 0 });
}

function flattenLeaves(bs: BodyStructure): Extract<BodyStructure, { kind: 'leaf' }>[] {
  return bs.kind === 'leaf' ? [bs] : bs.children.flatMap(flattenLeaves);
}

/** First text/plain leaf, else the first text/html leaf, else undefined (no textual part). */
function pickTextPart(bs: BodyStructure): Extract<BodyStructure, { kind: 'leaf' }> | undefined {
  const texts = flattenLeaves(bs).filter((l) => l.type === 'TEXT');
  return texts.find((l) => l.subtype === 'PLAIN') ?? texts.find((l) => l.subtype === 'HTML');
}

// ---------------------------------------------------------------------------------------------
// Charset / transfer-encoding / RFC 2047 decoding. TextDecoder first; iso-8859-1, latin1,
// windows-1252 and us-ascii/ascii are decoded by hand as a fallback for a runtime whose
// TextDecoder doesn't know the label (brief requirement) — all four are just byte->codepoint
// tables, no ICU needed.
// ---------------------------------------------------------------------------------------------

const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function latin1Decode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function windows1252Decode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b);
  }
  return s;
}

const CHARSET_FALLBACKS: Record<string, (bytes: Uint8Array) => string> = {
  'iso-8859-1': latin1Decode,
  latin1: latin1Decode,
  l1: latin1Decode,
  'windows-1252': windows1252Decode,
  'cp-1252': windows1252Decode,
  cp1252: windows1252Decode,
  'us-ascii': latin1Decode,
  ascii: latin1Decode,
};

function decodeCharset(bytes: Uint8Array, label: string): string {
  const norm = label.trim().toLowerCase();
  try {
    return new TextDecoder(norm).decode(bytes);
  } catch {
    const fallback = CHARSET_FALLBACKS[norm];
    if (fallback) return fallback(bytes);
    return latin1Decode(bytes); // last resort: never throw over an unknown label
  }
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Decode(input: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    if (ch === '=') break;
    const val = B64_CHARS.indexOf(ch);
    if (val === -1) continue; // skip whitespace/newlines
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function quotedPrintableDecode(bytes: Uint8Array): Uint8Array {
  const text = latin1Decode(bytes).replace(/=\r\n/g, '').replace(/=\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(text.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function decodeTransferEncoding(bytes: Uint8Array, encoding: string): Uint8Array {
  if (encoding === 'BASE64') return base64Decode(latin1Decode(bytes));
  if (encoding === 'QUOTED-PRINTABLE') return quotedPrintableDecode(bytes);
  return bytes; // 7BIT/8BIT/BINARY: already the raw bytes
}

const ENCODED_WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

/** RFC 2047 encoded-word decoding for From/Subject header values. */
function decodeRfc2047(header: string): string {
  return header
    .replace(/\?=\s+=\?/g, '?==?') // join adjacent encoded-words (RFC 2047 §6.2)
    .replace(ENCODED_WORD, (_all, charset: string, enc: string, text: string) => {
      if (enc.toUpperCase() === 'B') return decodeCharset(base64Decode(text), charset);
      const withSpaces = text.replace(/_/g, ' ');
      return decodeCharset(quotedPrintableDecode(encodeAscii(withSpaces)), charset);
    })
    .replace(//g, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function buildPreview(
  rawBytes: Uint8Array,
  part: Extract<BodyStructure, { kind: 'leaf' }>,
): string {
  const decodedBytes = decodeTransferEncoding(rawBytes, part.encoding);
  const text = decodeCharset(decodedBytes, part.charset ?? 'us-ascii');
  const plain = part.subtype === 'HTML' ? stripHtml(text) : text;
  return collapseWhitespace(plain).slice(0, 200);
}

function parseFromHeader(raw: string): { fromName?: string; fromAddress: string } {
  const decoded = decodeRfc2047(raw).trim();
  const m = /^(.*)<([^>]+)>\s*$/.exec(decoded);
  if (m) {
    const name = m[1]!.trim().replace(/^"|"$/g, '');
    return name ? { fromName: name, fromAddress: m[2]!.trim() } : { fromAddress: m[2]!.trim() };
  }
  return { fromAddress: decoded };
}

function parseHeaderBlock(text: string): {
  fromName?: string;
  fromAddress: string;
  subject: string;
} {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r\n|\n/)) {
    const m = /^([A-Za-z-]+):\s?(.*)$/.exec(line);
    if (m) headers[m[1]!.toLowerCase()] = m[2]!;
  }
  const from = parseFromHeader(headers['from'] ?? '');
  return { ...from, subject: decodeRfc2047(headers['subject'] ?? '').trim() };
}

function parseImapDate(raw: string): Date {
  // "01-Jan-2026 12:00:00 +0000" -> "01 Jan 2026 12:00:00 +0000", which Date() parses correctly.
  return new Date(raw.replace(/-/g, ' '));
}

function extractBalanced(s: string, openIdx: number): { text: string; endIdx: number } {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return { text: s.slice(openIdx, i + 1), endIdx: i };
    }
  }
  throw new ImapProtocolError(`unbalanced parens from index ${openIdx}: ${s}`);
}

interface FetchMeta {
  uid: number;
  flags: string[];
  internalDate: Date;
  bodyStructure: BodyStructure;
}

const FETCH_META_RE =
  /^\* (\d+) FETCH \(UID (\d+) FLAGS \(([^)]*)\) INTERNALDATE "([^"]+)" BODYSTRUCTURE /;

function parseFetchMetaLine(line: string): FetchMeta {
  const m = FETCH_META_RE.exec(line);
  if (!m) throw new ImapProtocolError(`unrecognised FETCH meta line: ${line}`);
  const [, , uidStr, flagsStr, dateStr] = m;
  const bsStart = m.index + m[0].length;
  const { text, endIdx } = extractBalanced(line, bsStart);
  if (line[endIdx + 1] !== ')') {
    throw new ImapProtocolError(`expected ")" closing FETCH after BODYSTRUCTURE: ${line}`);
  }
  return {
    uid: Number(uidStr),
    flags: flagsStr!.trim().length ? flagsStr!.trim().split(/\s+/) : [],
    internalDate: parseImapDate(dateStr!),
    bodyStructure: parseBodyStructure(text),
  };
}

function parseSearchIds(untagged: string[]): number[] {
  const line = untagged.find((l) => l.startsWith('* SEARCH'));
  if (!line) return [];
  const rest = line.slice('* SEARCH'.length).trim();
  return rest.length ? rest.split(/\s+/).map(Number) : [];
}

function parseSelectInfo(untagged: string[]): { uidValidity: number; uidNext: number } {
  let uidValidity: number | undefined;
  let uidNext: number | undefined;
  for (const line of untagged) {
    const v = /\[UIDVALIDITY (\d+)\]/.exec(line);
    if (v) uidValidity = Number(v[1]);
    const n = /\[UIDNEXT (\d+)\]/.exec(line);
    if (n) uidNext = Number(n[1]);
  }
  if (uidValidity === undefined || uidNext === undefined) {
    throw new ImapProtocolError('SELECT response missing UIDVALIDITY/UIDNEXT');
  }
  return { uidValidity, uidNext };
}

// ---------------------------------------------------------------------------------------------
// Low-level connection: one tagged command/response cycle at a time (IMAP is not pipelined
// here — one connection is opened and closed per refresh, per contracts/providers.md).
// ---------------------------------------------------------------------------------------------

class ImapConnection {
  private tagCounter = 0;
  readonly reader: LineReader;

  constructor(private readonly socket: Socket) {
    this.reader = new LineReader(socket);
  }

  private nextTag(): string {
    this.tagCounter += 1;
    return `a${this.tagCounter}`;
  }

  private async send(tag: string, command: string): Promise<void> {
    await this.socket.write(encodeAscii(`${tag} ${command}\r\n`));
  }

  private async readUntilTagged(tag: string): Promise<{ untagged: string[]; tagLine: string }> {
    const untagged: string[] = [];
    for (;;) {
      const line = await this.reader.readLine();
      if (line.startsWith(`${tag} `)) return { untagged, tagLine: line };
      untagged.push(line);
    }
  }

  private assertOk(tag: string, tagLine: string, label: string): void {
    if (!tagLine.startsWith(`${tag} OK`)) throw new ImapCommandError(`${label} failed: ${tagLine}`);
  }

  async login(username: string, password: string): Promise<void> {
    const tag = this.nextTag();
    await this.send(tag, `LOGIN "${username}" "${password}"`);
    const { tagLine } = await this.readUntilTagged(tag);
    this.assertOk(tag, tagLine, 'LOGIN');
  }

  async selectInbox(): Promise<{ uidValidity: number; uidNext: number }> {
    const tag = this.nextTag();
    await this.send(tag, 'SELECT INBOX');
    const { untagged, tagLine } = await this.readUntilTagged(tag);
    this.assertOk(tag, tagLine, 'SELECT INBOX');
    return parseSelectInfo(untagged);
  }

  async searchUnseenCount(): Promise<number> {
    const tag = this.nextTag();
    await this.send(tag, 'SEARCH UNSEEN');
    const { untagged, tagLine } = await this.readUntilTagged(tag);
    this.assertOk(tag, tagLine, 'SEARCH UNSEEN');
    return parseSearchIds(untagged).length;
  }

  async uidSearchAll(): Promise<number[]> {
    const tag = this.nextTag();
    await this.send(tag, 'UID SEARCH ALL');
    const { untagged, tagLine } = await this.readUntilTagged(tag);
    this.assertOk(tag, tagLine, 'UID SEARCH ALL');
    return parseSearchIds(untagged);
  }

  async fetchMeta(uid: number): Promise<FetchMeta> {
    const tag = this.nextTag();
    await this.send(tag, `UID FETCH ${uid} (FLAGS INTERNALDATE BODYSTRUCTURE)`);
    const { untagged, tagLine } = await this.readUntilTagged(tag);
    this.assertOk(tag, tagLine, 'UID FETCH');
    const metaLine = untagged.find((l) => l.includes('BODYSTRUCTURE'));
    if (!metaLine) throw new ImapProtocolError(`no FETCH meta line for UID ${uid}`);
    return parseFetchMetaLine(metaLine);
  }

  /** Reads a single literal-bearing untagged FETCH response of the shape
   * `* <seq> FETCH (... {N}` <N literal bytes> `)` followed by the tagged completion. */
  private async fetchLiteral(tag: string): Promise<Uint8Array> {
    const line = await this.reader.readLine();
    const m = /\{(\d+)\}$/.exec(line);
    if (!m) throw new ImapProtocolError(`expected literal marker in: ${line}`);
    const literal = await this.reader.readExact(Number(m[1]));
    const closing = await this.reader.readLine();
    if (closing !== ')') throw new ImapProtocolError(`expected ")" after literal, got: ${closing}`);
    const tagLine = await this.reader.readLine();
    this.assertOk(tag, tagLine, 'UID FETCH');
    return literal;
  }

  async fetchHeaderFields(uid: number): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.send(tag, `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`);
    return this.fetchLiteral(tag);
  }

  async fetchPartPreview(uid: number, partNum: number): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.send(tag, `UID FETCH ${uid} (BODY.PEEK[${partNum}]<0.200>)`);
    return this.fetchLiteral(tag);
  }

  async logout(): Promise<void> {
    const tag = this.nextTag();
    try {
      await this.send(tag, 'LOGOUT');
      await this.readUntilTagged(tag);
    } catch {
      // best effort — the connection is being closed either way
    } finally {
      await this.socket.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// MailSource
// ---------------------------------------------------------------------------------------------

export class ImapMailSource implements MailSource {
  constructor(private readonly connect: Connect) {}

  private async dial(cred: ImapCredential): Promise<ImapConnection> {
    const socket = await this.connect({ host: cred.host, port: cred.port, tls: cred.tls });
    return new ImapConnection(socket);
  }

  async fetchInbox(
    cred: ImapCredential,
    limit: number,
    cursor?: string,
  ): Promise<{ messages: MessageHeader[]; unreadTotal?: number; cursor?: string; full: boolean }> {
    const conn = await this.dial(cred);
    try {
      try {
        await conn.login(cred.username, cred.password);
      } catch (err) {
        throw new AuthError(`IMAP login failed: ${(err as Error).message}`);
      }
      let selectInfo: { uidValidity: number; uidNext: number };
      try {
        selectInfo = await conn.selectInbox();
      } catch (err) {
        throw new AuthError(`IMAP SELECT INBOX failed: ${(err as Error).message}`);
      }

      const unreadTotal = await conn.searchUnseenCount();
      const uids = await conn.uidSearchAll(); // ascending
      const cursorUidValidity = cursor?.split(':')[0];
      const full = !cursor || cursorUidValidity !== String(selectInfo.uidValidity);
      const newestFirst = uids.slice(-limit).reverse();

      const messages: MessageHeader[] = [];
      for (const uid of newestFirst) {
        const meta = await conn.fetchMeta(uid);
        const headerBytes = await conn.fetchHeaderFields(uid);
        const headers = parseHeaderBlock(decodeCharset(headerBytes, 'us-ascii'));
        const part = pickTextPart(meta.bodyStructure);
        const preview = part
          ? buildPreview(await conn.fetchPartPreview(uid, part.partNum), part)
          : '';
        const message: MessageHeader = {
          providerMessageId: String(uid),
          fromAddress: headers.fromAddress,
          subject: headers.subject,
          preview,
          receivedAt: meta.internalDate,
          unread: !meta.flags.includes('\\Seen'),
        };
        if (headers.fromName !== undefined) message.fromName = headers.fromName;
        messages.push(message);
      }

      return {
        messages,
        unreadTotal,
        cursor: `${selectInfo.uidValidity}:${selectInfo.uidNext}`,
        full,
      };
    } finally {
      await conn.logout();
    }
  }

  async verify(cred: ImapCredential): Promise<void> {
    const conn = await this.dial(cred);
    try {
      try {
        await conn.login(cred.username, cred.password);
      } catch (err) {
        throw new VerificationError(`IMAP login failed: ${(err as Error).message}`, 'login');
      }
      try {
        await conn.selectInbox();
      } catch (err) {
        throw new VerificationError(`IMAP SELECT INBOX failed: ${(err as Error).message}`, 'inbox');
      }
    } finally {
      await conn.logout();
    }
  }

  /** No-op: IMAP has no OAuth grant to revoke server-side (contracts/providers.md — "none;
   * credential deleted"); the caller simply deletes the stored app password. */
  async revoke(): Promise<void> {}
}
