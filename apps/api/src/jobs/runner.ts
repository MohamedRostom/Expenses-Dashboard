// T018: JobRunner per research.md R7 — one runJob(name, payload) entry point over the jobs table.
import type { Db } from '../adapters/rate-limiter.js';
import { jobs } from './index.js';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

function backoffMs(attempts: number): number {
  return Math.min(attempts, 5) * 1000;
}

export class JobRunner {
  constructor(private readonly db: Db) {}

  async enqueue(
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO jobs (name, user_id, payload, run_after) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, opts?.userId ?? null, payload, opts?.runAfter ?? new Date()],
    );
    const row = rows[0];
    if (!row) throw new Error('JobRunner.enqueue: INSERT ... RETURNING id returned no row');
    return row.id;
  }

  async runDueJobs(): Promise<void> {
    const { rows: claimed } = await this.db.query<{
      id: string;
      name: string;
      payload: unknown;
      attempts: number;
    }>(
      `SELECT * FROM jobs WHERE status = 'queued' AND run_after <= $1
       ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT $2`,
      [new Date(), BATCH_SIZE],
    );

    for (const job of claimed) {
      const handler = jobs.get(job.name);
      try {
        if (!handler) throw new Error(`no handler registered for job "${job.name}"`);
        await handler(job.payload, {
          updateProgress: async (done, total) => {
            await this.db.query(
              `UPDATE jobs SET progress_done = $1, progress_total = $2 WHERE id = $3`,
              [done, total ?? null, job.id],
            );
          },
        });
        await this.db.query(`UPDATE jobs SET status = 'done', finished_at = $1 WHERE id = $2`, [
          new Date(),
          job.id,
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const attempts = job.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          await this.db.query(
            `UPDATE jobs SET status = 'queued', error = $1, attempts = $2, run_after = $3, started_at = NULL WHERE id = $4`,
            [message, attempts, new Date(Date.now() + backoffMs(attempts)), job.id],
          );
        } else {
          await this.db.query(
            `UPDATE jobs SET status = 'failed', error = $1, attempts = $2, finished_at = $3 WHERE id = $4`,
            [message, attempts, new Date(), job.id],
          );
        }
      }
    }
  }

  async cancelForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'failed', error = 'cancelled', finished_at = $1 WHERE user_id = $2 AND status IN ('queued','running')`,
      [new Date(), userId],
    );
  }
}
