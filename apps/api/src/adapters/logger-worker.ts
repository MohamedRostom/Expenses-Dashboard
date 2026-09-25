// T113: Sentry error reporting for the Cloudflare Workers runtime — same contract as
// logger-node.ts, additive to the JSON-stdout Logger, no-op when SENTRY_DSN is unset.
//
// `@sentry/cloudflare`'s optional peer on `@cloudflare/workers-types` makes pnpm resolve a
// second, type-incompatible copy of drizzle-orm across the whole apps/api workspace the moment
// it's a direct dependency (verified: adding it broke typecheck in unrelated test files with
// duplicate-drizzle-orm "private property 'shouldInlineParams'" errors). Workers wiring is
// Phase 6 anyway (worker.ts's `notWired` stubs) and CLAUDE.md says any dependency that can't
// pass the worker-build job gets wrapped behind an interface first — so this adapter takes a
// minimal injected client shape instead of importing the package. Phase 6 wires `@sentry/cloudflare`
// (or `toucan-js`) in worker.ts and passes it in; nothing here needs to change when it does.
import type { Logger, LogEvent } from './logger.js';
import { logger as baseLogger } from './logger.js';

export type SentryLikeClient = {
  captureException(error: unknown, context?: { extra?: Record<string, unknown> }): void;
  captureMessage(
    message: string,
    context?: { level?: string; extra?: Record<string, unknown> },
  ): void;
};

/** Wraps the base JSON-stdout logger: still logs every event, and additionally reports to
 * `sentry` (captureException for status >= 500, captureMessage otherwise) when both a DSN and a
 * client are provided. */
export function createWorkerLogger(dsn: string | undefined, sentry?: SentryLikeClient): Logger {
  return {
    log(event: LogEvent) {
      baseLogger.log(event);
      if (!dsn || !sentry) return;
      if (event['status'] !== undefined && (event['status'] as number) >= 500) {
        sentry.captureException(new Error(`${event.route} responded ${event['status']}`), {
          extra: event,
        });
      } else if (event['error']) {
        sentry.captureMessage(String(event['error']), { level: 'error', extra: event });
      }
    },
  };
}
