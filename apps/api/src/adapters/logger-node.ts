// T113: Sentry error reporting for the Node runtime, additive to the JSON-stdout Logger
// (research.md R15) — never replaces it, and is a no-op when SENTRY_DSN is unset so Sentry
// stays fully optional to boot.
import * as Sentry from '@sentry/node';
import type { Logger, LogEvent } from './logger.js';
import { logger as baseLogger } from './logger.js';

let initialized = false;

function initOnce(dsn: string): void {
  if (initialized) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
  initialized = true;
}

/** Wraps the base JSON-stdout logger: still logs every event, and additionally reports to
 * Sentry (captureException for status >= 500, captureMessage otherwise) when SENTRY_DSN is set. */
export function createNodeLogger(dsn: string | undefined): Logger {
  if (dsn) initOnce(dsn);

  return {
    log(event: LogEvent) {
      baseLogger.log(event);
      if (!dsn) return;
      if (event['status'] !== undefined && (event['status'] as number) >= 500) {
        // Prefer the real exception middleware/errors.ts attached (real stack, real message)
        // over a synthetic one that only ever said "route responded 500".
        const real = event['errorObject'];
        const error =
          real instanceof Error ? real : new Error(`${event.route} responded ${event['status']}`);
        Sentry.captureException(error, { extra: event });
      } else if (event['error']) {
        Sentry.captureMessage(String(event['error']), { level: 'error', extra: event });
      }
    },
  };
}
