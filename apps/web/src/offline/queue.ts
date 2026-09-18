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
 * 2xx removes the row; 4xx marks it 'rejected' with a reason and keeps it visible, no retry;
 * a network error (or any other throw) leaves it 'pending' for the next flush attempt. */
export async function flush(): Promise<void> {
  const rows = await list();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    try {
      await apiFetch('/expenses', { method: 'POST', body: JSON.stringify(row.input) });
      await (await db()).delete(STORE, row.id);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        await (await db()).put(STORE, { ...row, status: 'rejected', reason: err.message });
      }
      // network error / 5xx: leave as pending, retried on the next flush
    }
  }
}

/** Wires flush() to fire on `online`, on app start, and via Background Sync where supported
 * (Safari and older browsers lack it — feature-detected, never throws). Call once from main.ts. */
export function initOfflineQueue(): void {
  void flush();
  window.addEventListener('online', () => void flush());
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.ready
      .then((reg) =>
        (
          reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
        ).sync?.register('flush-expenses'),
      )
      .catch(() => {});
  }
}
