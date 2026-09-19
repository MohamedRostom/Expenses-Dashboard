import { openDB, type IDBPDatabase } from 'idb';
import type { CreateExpenseRequestT } from '@desk/contracts';
import { apiFetch, ApiError } from '../api/client.js';
import { uuidv7 } from './uuid.js';

const DB_NAME = 'desk-offline';
const STORE = 'pending-expenses';

export type QueuedExpense = {
  id: string; // client-generated uuid v7, also the expense id (idempotent create)
  input: CreateExpenseRequestT;
  status: 'pending' | 'rejected';
  reason?: string;
};

let dbPromise: Promise<IDBPDatabase> | undefined;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** Adds an expense to the offline queue with a client-generated uuid v7 id (same generator as
 * the expenses store's optimistic create — apps/web/src/offline/uuid.ts). Survives session
 * expiry: IndexedDB is independent of the session cookie, and nothing here clears it on a 401. */
export async function enqueue(input: Omit<CreateExpenseRequestT, 'id'>): Promise<QueuedExpense> {
  const id = uuidv7();
  const row: QueuedExpense = { id, input: { ...input, id }, status: 'pending' };
  await (await db()).put(STORE, row);
  return row;
}

/** All queued rows (pending and rejected), oldest first (uuid v7 ids sort chronologically). */
export async function list(): Promise<QueuedExpense[]> {
  const rows = await (await db()).getAll(STORE);
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export async function pendingCount(): Promise<number> {
  return (await list()).filter((r) => r.status === 'pending').length;
}

/** Sum of pending rows in `currency` (minor units) — for MonthView's "estimated" addition to
 * the authoritative total. Rows in another currency are skipped (no local FX conversion). */
export function estimatedTotal(rows: QueuedExpense[], currency: string): number {
  return rows
    .filter((r) => r.status === 'pending' && r.input.amount.currency === currency)
    .reduce((sum, r) => sum + r.input.amount.minor, 0);
}

/** POSTs every pending row (idempotent by id — apps/api's create() does onConflictDoNothing).
 * 2xx removes the row; a validation-style 4xx (not 401/403) marks it 'rejected' with a reason
 * and keeps it visible, no retry; a network error, 401/403 (C8: session expiry must not lose
 * the row — the user re-authenticates and the same row flushes fine after), or a 5xx leaves it
 * 'pending' for the next flush attempt. */
// flush() is called from several places (app start, the 'online' event, Background Sync) that
// can genuinely overlap — without a guard, two concurrent calls both read the same pending row
// before either deletes it, firing a duplicate POST /expenses (harmless — create is idempotent
// by client id — but still a wasted request every time it happens).
let flushing = false;

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await flushOnce();
  } finally {
    flushing = false;
  }
}

async function flushOnce(): Promise<void> {
  const rows = await list();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    try {
      await apiFetch('/expenses', { method: 'POST', body: JSON.stringify(row.input) });
      await (await db()).delete(STORE, row.id);
    } catch (err) {
      const isAuthError = err instanceof ApiError && (err.status === 401 || err.status === 403);
      if (err instanceof ApiError && !isAuthError && err.status >= 400 && err.status < 500) {
        await (await db()).put(STORE, { ...row, status: 'rejected', reason: err.message });
      }
      // network error / auth error / 5xx: leave as pending, retried on the next flush
    }
  }
}

/** Discards a rejected row permanently — the user chose not to retry it. */
export async function discard(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

/** Puts a rejected row back to 'pending' and immediately retries flushing the whole queue. */
export async function retry(id: string): Promise<void> {
  const row = await (await db()).get(STORE, id);
  if (!row) return;
  await (await db()).put(STORE, { ...row, status: 'pending', reason: undefined });
  await flush();
}

/** Wires flush() to fire on `online` and on app start. Call once from main.ts.
 *
 * Background Sync (registering a 'flush-expenses' tag so the OS wakes the SW to flush even
 * while the tab is closed) used to be attempted here, but vite.config.ts's PWA plugin uses
 * Workbox's `generateSW` strategy, which builds the service worker from config and has no way
 * to add a custom `sync` event listener — the SW never listened for that tag, so registering it
 * was a no-op that looked like it did something. Real support needs `injectManifest` (a
 * hand-written SW source importing this module's flush logic) — a bigger change than restoring
 * dead code, so it's a real to-do rather than a false "it works" left in place. */
export function initOfflineQueue(): void {
  void flush();
  window.addEventListener('online', () => void flush());
}
