import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue, estimatedTotal, flush, initOfflineQueue, list } from './queue.js';

/** Test-only: clears the 'pending-expenses' store between tests, including rejected rows
 * that flush() deliberately never retries. */
async function clearAll(): Promise<void> {
  await list(); // ensures the db/store exist (queue.ts opens with the upgrade callback)
  const db = await openDB('desk-offline', 1);
  await db.clear('pending-expenses');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const baseInput = {
  description: 'Coffee',
  amount: { minor: 350, currency: 'GBP' },
  date: '2026-09-18',
  categoryId: null,
  paidWith: 'card',
  kind: 'variable',
} as const;

describe('offline queue', () => {
  // Same DB connection across tests (deleting/reopening fake-indexeddb between tests hangs on
  // stale open handles) — clear the store directly instead.
  beforeEach(async () => {
    document.cookie = '';
    await clearAll();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enqueue generates a uuid v7 id (version nibble 7, variant 10xx)', async () => {
    const row = await enqueue(baseInput);
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(row.input.id).toBe(row.id);
    expect(row.status).toBe('pending');
  });

  it('flush posts pending rows and removes them on 2xx', async () => {
    const row = await enqueue(baseInput);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ expense: { id: row.id } }, 201)),
    );
    await flush();
    expect(await list()).toHaveLength(0);
  });

  it('keeps a 4xx-rejected row visible with a reason, and does not retry it', async () => {
    await enqueue(baseInput);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'validation_failed', message: 'bad amount' } }, 400),
        ),
    );
    await flush();
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('rejected');
    expect(rows[0]?.reason).toBe('bad amount');

    // a second flush must not re-POST a rejected row
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves a network-error row pending for the next flush attempt', async () => {
    await enqueue(baseInput);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network error')));
    await flush();
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');
  });

  it('queue survives session expiry (a 401 does not clear it)', async () => {
    await enqueue(baseInput);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'unauthenticated', message: 'expired' } }, 401),
        ),
    );
    await flush();
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('rejected'); // 401 is a 4xx — surfaced, not retried forever
  });

  it('local totals include queued rows as estimated', async () => {
    await enqueue(baseInput);
    await enqueue({ ...baseInput, amount: { minor: 500, currency: 'GBP' } });
    await enqueue({ ...baseInput, amount: { minor: 999, currency: 'EUR' } });
    expect(estimatedTotal(await list(), 'GBP')).toBe(850);
  });

  it('flush fires on the online event', async () => {
    await enqueue(baseInput);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ expense: {} }, 201)));
    initOfflineQueue();
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 50));
    expect(await list()).toHaveLength(0);
  });
});
