import { JobRunner } from '../../src/jobs/runner.js';
import { jobs, registerJob } from '../../src/jobs/index.js';
import type { Db } from '../../src/adapters/rate-limiter.js';

interface JobRow {
  id: string;
  name: string;
  user_id: string | null;
  payload: unknown;
  status: string;
  run_after: Date;
  started_at: Date | null;
  finished_at: Date | null;
  progress_done: number;
  progress_total: number | null;
  error: string | null;
  attempts: number;
}

/** Tiny in-memory fake of the jobs table implementing the minimal Db port used by PgRateLimiter. */
function fakeDb() {
  const rows = new Map<string, JobRow>();
  let seq = 0;
  const db = {
    async query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
      if (sql.startsWith('INSERT INTO jobs')) {
        const [name, userId, payload, runAfter] = params as [string, string | null, unknown, Date];
        const id = `job-${++seq}`;
        const row: JobRow = {
          id,
          name,
          user_id: userId,
          payload,
          status: 'queued',
          run_after: runAfter,
          started_at: null,
          finished_at: null,
          progress_done: 0,
          progress_total: null,
          error: null,
          attempts: 0,
        };
        rows.set(id, row);
        return { rows: [{ id }] as T[] };
      }
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        // claim due queued jobs
        const now = params[0] as Date;
        const limit = params[1] as number;
        const due = [...rows.values()]
          .filter((r) => r.status === 'queued' && r.run_after.getTime() <= now.getTime())
          .slice(0, limit);
        for (const r of due) {
          r.status = 'running';
          r.started_at = now;
        }
        return { rows: due.map((r) => ({ ...r })) as T[] };
      }
      if (sql.startsWith('UPDATE jobs SET progress_done')) {
        const [done, total, id] = params as [number, number | null, string];
        const row = rows.get(id);
        if (row) {
          row.progress_done = done;
          row.progress_total = total;
        }
        return { rows: [] as T[] };
      }
      if (sql.startsWith("UPDATE jobs SET status = 'done'")) {
        const [, id] = params as [Date, string];
        const row = rows.get(id);
        if (row) {
          row.status = 'done';
          row.finished_at = new Date();
        }
        return { rows: [] as T[] };
      }
      if (sql.startsWith("UPDATE jobs SET status = 'failed'") && sql.includes('WHERE user_id')) {
        const [, userId] = params as [Date, string];
        const cancelled: JobRow[] = [];
        for (const r of rows.values()) {
          if (r.user_id === userId && (r.status === 'queued' || r.status === 'running')) {
            r.status = 'failed';
            r.error = 'cancelled';
            r.finished_at = new Date();
            cancelled.push(r);
          }
        }
        return { rows: cancelled.map((r) => ({ ...r })) as T[] };
      }
      if (sql.startsWith("UPDATE jobs SET status = 'failed', error")) {
        // permanent failure (attempts exhausted)
        const [error, attempts, , id] = params as [string, number, Date, string];
        const row = rows.get(id);
        if (row) {
          row.status = 'failed';
          row.error = error;
          row.attempts = attempts;
          row.finished_at = new Date();
        }
        return { rows: [] as T[] };
      }
      if (sql.startsWith("UPDATE jobs SET status = 'queued', error")) {
        // retry: back to queued
        const [error, attempts, runAfter, id] = params as [string, number, Date, string];
        const row = rows.get(id);
        if (row) {
          row.status = 'queued';
          row.error = error;
          row.attempts = attempts;
          row.run_after = runAfter;
          row.started_at = null;
        }
        return { rows: [] as T[] };
      }
      throw new Error(`fakeDb: unhandled sql: ${sql}`);
    },
  };
  return { db: db as Db, rows };
}

describe('JobRunner', () => {
  beforeEach(() => {
    jobs.clear();
  });

  it('enqueue inserts a queued row and returns its id', async () => {
    const { db } = fakeDb();
    const runner = new JobRunner(db);
    const id = await runner.enqueue('noop', { a: 1 });
    expect(id).toBeTruthy();
  });

  it('runDueJobs claims due jobs with SKIP LOCKED and runs the registered handler to completion', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    let received: unknown;
    registerJob('echo', async (payload) => {
      received = payload;
    });
    const id = await runner.enqueue('echo', { hello: 'world' });
    await runner.runDueJobs();
    expect(received).toEqual({ hello: 'world' });
    expect(rows.get(id)!.status).toBe('done');
  });

  it('does not claim jobs whose run_after is in the future', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    registerJob('later', async () => {});
    const id = await runner.enqueue('later', {}, { runAfter: new Date(Date.now() + 60_000) });
    await runner.runDueJobs();
    expect(rows.get(id)!.status).toBe('queued');
  });

  it('records progress written by the handler via updateProgress', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    registerJob('batchy', async (_payload, ctx) => {
      await ctx.updateProgress(1, 2);
      await ctx.updateProgress(2, 2);
    });
    const id = await runner.enqueue('batchy', {});
    await runner.runDueJobs();
    expect(rows.get(id)!.progress_done).toBe(2);
    expect(rows.get(id)!.progress_total).toBe(2);
    expect(rows.get(id)!.status).toBe('done');
  });

  it('retries a failing job up to 5 attempts, then leaves it failed with the error', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    let calls = 0;
    registerJob('boom', async () => {
      calls++;
      throw new Error('kaboom');
    });
    const id = await runner.enqueue('boom', {});
    // run 5 times (each run only processes jobs whose run_after <= now; backoff is 0-ish in test via direct requeue)
    for (let i = 0; i < 5; i++) {
      // force run_after to now so it's claimable immediately despite backoff
      rows.get(id)!.run_after = new Date(0);
      await runner.runDueJobs();
    }
    expect(calls).toBe(5);
    expect(rows.get(id)!.status).toBe('failed');
    expect(rows.get(id)!.error).toBe('kaboom');
    expect(rows.get(id)!.attempts).toBe(5);
  });

  it('cancelForUser cancels queued/running jobs for that user only', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    const idA1 = await runner.enqueue('x', {}, { userId: 'user-a' });
    const idA2 = await runner.enqueue('x', {}, { userId: 'user-a' });
    const idB = await runner.enqueue('x', {}, { userId: 'user-b' });
    await runner.cancelForUser('user-a');
    expect(rows.get(idA1)!.status).toBe('failed');
    expect(rows.get(idA1)!.error).toBe('cancelled');
    expect(rows.get(idA2)!.status).toBe('failed');
    expect(rows.get(idB)!.status).toBe('queued');
  });

  it('throws (or leaves queued) when no handler is registered for the job name', async () => {
    const { db, rows } = fakeDb();
    const runner = new JobRunner(db);
    const id = await runner.enqueue('unknown-job', {});
    await runner.runDueJobs();
    // treated as a failure of that run, so it goes through the retry path
    const row = rows.get(id)!;
    expect(['queued', 'failed']).toContain(row.status);
    expect(row.attempts).toBeGreaterThan(0);
  });
});
