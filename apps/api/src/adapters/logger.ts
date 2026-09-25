// T017: one JSON line per event to stdout. Never logs a raw user id — hash it first.
export interface LogEvent {
  requestId: string;
  hashedUserId: string | null;
  route: string;
  status: number;
  durationMs: number;
  [key: string]: unknown;
}

export interface Logger {
  log(event: LogEvent): void;
}

export const logger: Logger = {
  log(event) {
    console.log(JSON.stringify(event));
  },
};

/** SHA-256 of the user id, hex-encoded — never log a raw user id. */
export async function hashUserId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
