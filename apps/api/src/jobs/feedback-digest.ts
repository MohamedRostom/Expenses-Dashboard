// T112: feedback.digest — daily summary of the last 24h of feedback rows emailed to
// FEEDBACK_DIGEST_EMAIL (env.ts, optional — skips sending when unset). Self-reschedules 24h out,
// same pattern as jobs/notion-sync.ts's notion.sync.
import { gte } from 'drizzle-orm';
import { feedback, type Db } from '@desk/db';
import type { JobHandler } from './index.js';
import type { Mailer } from '../adapters/mailer.js';

const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type FeedbackDigestDeps = {
  db: Db;
  mailer: Mailer;
  digestEmail: string | undefined;
  clock: { now(): Date };
  enqueue: (name: string, payload: unknown, opts?: { runAfter?: Date }) => Promise<string>;
};

/** User-submitted feedback text goes straight into this HTML email — escape it or it's a
 * stored-XSS vector against whoever reads the digest (Rostom's own inbox). */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDigest(rows: (typeof feedback.$inferSelect)[]): string {
  if (rows.length === 0) return '<p>No feedback in the last 24 hours.</p>';
  const items = rows
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.page)}</strong> (${r.contactOk ? 'ok to contact' : 'anonymous'}): ${escapeHtml(r.message)}</li>`,
    )
    .join('');
  return `<p>${rows.length} feedback submission(s) in the last 24 hours:</p><ul>${items}</ul>`;
}

export function feedbackDigestJob(deps: FeedbackDigestDeps): JobHandler {
  return async () => {
    if (deps.digestEmail) {
      const since = new Date(deps.clock.now().getTime() - DIGEST_INTERVAL_MS);
      const rows = await deps.db.select().from(feedback).where(gte(feedback.createdAt, since));
      await deps.mailer.send({
        to: deps.digestEmail,
        subject: `Desk feedback digest: ${rows.length} submission(s)`,
        html: renderDigest(rows),
      });
    }
    await deps.enqueue(
      'feedback.digest',
      {},
      { runAfter: new Date(deps.clock.now().getTime() + DIGEST_INTERVAL_MS) },
    );
  };
}
