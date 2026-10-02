// T052: a real TCP IMAP server for ImapMailSource (packages/connectors/src/imap/client.ts) to talk
// to over an actual socket — infra/mocks is a Node process, so node:net is fine here (unlike
// packages/connectors, which must stay Workers-compatible). Speaks exactly the command subset
// client.ts sends — LOGIN, SELECT INBOX, SEARCH UNSEEN, UID SEARCH ALL, UID FETCH (FLAGS
// INTERNALDATE BODYSTRUCTURE), UID FETCH (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)]), UID FETCH
// (BODY.PEEK[<n>]<0.200>) and LOGOUT — against an in-memory mailbox per username, backed by a
// dynamic responder rather than fake-server.ts's scripted transcript DSL (that DSL replays a
// fixed exchange list; this server's messages change at runtime via the control route below).
import { createServer, type Server, type Socket as NetSocket } from 'node:net';
import { Hono } from 'hono';

export interface ImapMessageInput {
  from: string;
  subject: string;
  body: string;
  date: string | Date;
  seen?: boolean;
}

interface ImapMessage {
  uid: number;
  from: string;
  subject: string;
  body: string;
  date: Date;
  seen: boolean;
}

interface Mailbox {
  uidValidity: number;
  nextUid: number;
  messages: ImapMessage[];
}

export interface ImapStore {
  mailboxes: Map<string, Mailbox>;
  /** Per-username password override; everyone else logs in with 'app-password'. */
  passwords: Map<string, string>;
}

// ponytail: one fixed UIDVALIDITY shared by every mailbox — "stable per mailbox" only requires it
// never change across a mailbox's SELECTs, and a shared constant trivially satisfies that; a
// real per-mailbox value would need nothing this client subset can observe.
const UID_VALIDITY = 1000001;

export function createImapStore(): ImapStore {
  return { mailboxes: new Map(), passwords: new Map() };
}

function mailboxFor(store: ImapStore, username: string): Mailbox {
  let mailbox = store.mailboxes.get(username);
  if (!mailbox) {
    mailbox = { uidValidity: UID_VALIDITY, nextUid: 101, messages: [] };
    store.mailboxes.set(username, mailbox);
  }
  return mailbox;
}

function addMessage(store: ImapStore, username: string, message: ImapMessageInput): void {
  const mailbox = mailboxFor(store, username);
  mailbox.messages.push({
    uid: mailbox.nextUid++,
    from: message.from,
    subject: message.subject,
    body: message.body,
    date: new Date(message.date),
    seen: message.seen ?? false,
  });
}

function markRead(store: ImapStore, username: string, uid: number): void {
  const message = mailboxFor(store, username).messages.find((m) => m.uid === uid);
  if (message) message.seen = true;
}

/**
 * Control route for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('imap')`):
 *   POST /__control/imap/messages { username, action: 'add', message } | { username, action: 'markRead', uid }
 *     | { username, action: 'setPassword', password } (lets a test drive a reconnect)
 * Mounted at the mocks app's root in server.ts, sharing an ImapStore with startImapMockServer so
 * a message added here is immediately visible to the next fetch over the TCP server.
 */
export function createImapMockApp(store: ImapStore = createImapStore()): Hono {
  const app = new Hono();

  app.post('/__control/imap/messages', async (c) => {
    const body = await c.req.json<
      | { username: string; action: 'add'; message: ImapMessageInput }
      | { username: string; action: 'markRead'; uid: number }
      | { username: string; action: 'setPassword'; password: string }
    >();
    if (body.action === 'add') {
      addMessage(store, body.username, body.message);
    } else if (body.action === 'markRead') {
      markRead(store, body.username, body.uid);
    } else if (body.action === 'setPassword') {
      store.passwords.set(body.username, body.password);
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    return c.json({ ok: true });
  });

  return app;
}

// -------------------------------------------------------------------------------------------
// Real TCP IMAP server
// -------------------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** IMAP INTERNALDATE format client.ts's parseImapDate() expects: "01-Jan-2026 12:00:00 +0000". */
function formatInternalDate(date: Date): string {
  const day = pad2(date.getUTCDate());
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const time = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
  return `${day}-${month}-${year} ${time} +0000`;
}

/** Buffers a net.Socket's 'data' events into a pull-based readLine() — a small, server-side
 * duplicate of packages/connectors/src/imap/line-reader.ts's buffering (that file isn't in
 * @desk/connectors's export map, and only apps/api may import its node:net socket adapters —
 * see apps/api/src/adapters/socket-node.ts's comment — so infra/mocks writes its own, kept to
 * exactly what a line-based server needs: no literal-reading, since the client never sends one). */
function createLineReader(socket: NetSocket): { readLine(): Promise<string> } {
  let buf = Buffer.alloc(0);
  let ended = false;
  const waiters: Array<() => void> = [];

  const wake = () => {
    while (waiters.length > 0) waiters.shift()!();
  };
  socket.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    wake();
  });
  socket.on('end', () => {
    ended = true;
    wake();
  });
  socket.on('close', () => {
    ended = true;
    wake();
  });

  return {
    async readLine(): Promise<string> {
      for (;;) {
        const idx = buf.indexOf('\r\n', 0, 'latin1');
        if (idx >= 0) {
          const line = buf.subarray(0, idx).toString('latin1');
          buf = buf.subarray(idx + 2);
          return line;
        }
        if (ended) throw new Error('imap mock: connection closed mid-line');
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

const LOGIN_RE = /^LOGIN "([^"]*)" "([^"]*)"$/;
const FETCH_META_RE = /^UID FETCH (\d+) \(FLAGS INTERNALDATE BODYSTRUCTURE\)$/;
const FETCH_HEADER_RE = /^UID FETCH (\d+) \(BODY\.PEEK\[HEADER\.FIELDS \(FROM SUBJECT DATE\)\]\)$/;
const FETCH_PART_RE = /^UID FETCH (\d+) \(BODY\.PEEK\[(\d+)\]<0\.200>\)$/;

async function handleConnection(socket: NetSocket, store: ImapStore): Promise<void> {
  const reader = createLineReader(socket);
  let username = '';

  for (;;) {
    let line: string;
    try {
      line = await reader.readLine();
    } catch {
      return; // client closed the connection
    }

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const tag = line.slice(0, spaceIdx);
    const rest = line.slice(spaceIdx + 1);

    const loginMatch = LOGIN_RE.exec(rest);
    if (loginMatch) {
      const [, user, password] = loginMatch;
      if (password !== (store.passwords.get(user!) ?? 'app-password')) {
        socket.write(`${tag} NO LOGIN failed\r\n`);
      } else {
        username = user!;
        socket.write(`${tag} OK LOGIN completed\r\n`);
      }
      continue;
    }

    if (rest === 'SELECT INBOX') {
      const mailbox = mailboxFor(store, username);
      socket.write(`* ${mailbox.messages.length} EXISTS\r\n`);
      socket.write(`* 0 RECENT\r\n`);
      socket.write(`* OK [UIDVALIDITY ${mailbox.uidValidity}] UIDs valid\r\n`);
      socket.write(`* OK [UIDNEXT ${mailbox.nextUid}] Predicted next UID\r\n`);
      socket.write(`${tag} OK [READ-ONLY] SELECT completed\r\n`);
      continue;
    }

    if (rest === 'SEARCH UNSEEN') {
      const unseen = mailboxFor(store, username)
        .messages.filter((m) => !m.seen)
        .map((m) => m.uid);
      socket.write(`* SEARCH${unseen.length ? ' ' + unseen.join(' ') : ''}\r\n`);
      socket.write(`${tag} OK SEARCH completed\r\n`);
      continue;
    }

    if (rest === 'UID SEARCH ALL') {
      const all = mailboxFor(store, username).messages.map((m) => m.uid);
      socket.write(`* SEARCH${all.length ? ' ' + all.join(' ') : ''}\r\n`);
      socket.write(`${tag} OK UID SEARCH completed\r\n`);
      continue;
    }

    const metaMatch = FETCH_META_RE.exec(rest);
    if (metaMatch) {
      const uid = Number(metaMatch[1]);
      const message = mailboxFor(store, username).messages.find((m) => m.uid === uid);
      if (!message) {
        socket.write(`${tag} NO UID FETCH failed\r\n`);
        continue;
      }
      const flags = message.seen ? '\\Seen' : '';
      const size = Buffer.byteLength(message.body);
      socket.write(
        `* ${uid} FETCH (UID ${uid} FLAGS (${flags}) INTERNALDATE "${formatInternalDate(message.date)}" ` +
          `BODYSTRUCTURE ("TEXT" "PLAIN" NIL "7BIT" ${size} 1))\r\n`,
      );
      socket.write(`${tag} OK UID FETCH completed\r\n`);
      continue;
    }

    const headerMatch = FETCH_HEADER_RE.exec(rest);
    if (headerMatch) {
      const uid = Number(headerMatch[1]);
      const message = mailboxFor(store, username).messages.find((m) => m.uid === uid);
      const headerText = message
        ? `From: ${message.from}\r\nSubject: ${message.subject}\r\nDate: ${message.date.toUTCString()}\r\n\r\n`
        : '\r\n';
      const bytes = Buffer.from(headerText, 'utf-8');
      socket.write(
        `* ${uid} FETCH (UID ${uid} BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {${bytes.length}}\r\n`,
      );
      socket.write(bytes);
      socket.write(`)\r\n`);
      socket.write(`${tag} OK UID FETCH completed\r\n`);
      continue;
    }

    const partMatch = FETCH_PART_RE.exec(rest);
    if (partMatch) {
      const uid = Number(partMatch[1]);
      const partNum = partMatch[2];
      const message = mailboxFor(store, username).messages.find((m) => m.uid === uid);
      const bytes = Buffer.from(message?.body ?? '', 'utf-8');
      socket.write(`* ${uid} FETCH (UID ${uid} BODY[${partNum}]<0> {${bytes.length}}\r\n`);
      socket.write(bytes);
      socket.write(`)\r\n`);
      socket.write(`${tag} OK UID FETCH completed\r\n`);
      continue;
    }

    if (rest === 'LOGOUT') {
      socket.write(`* BYE logging out\r\n`);
      socket.write(`${tag} OK LOGOUT completed\r\n`);
      socket.end();
      return;
    }

    socket.write(`${tag} BAD unrecognised command\r\n`);
  }
}

/** Starts the real TCP IMAP server on `port`, sharing `store` with createImapMockApp's control
 * route so a message added over HTTP is immediately visible to the next IMAP fetch. */
export function startImapMockServer(port: number, store: ImapStore = createImapStore()): Server {
  const server = createServer((socket) => {
    void handleConnection(socket, store);
  });
  server.listen(port);
  return server;
}
