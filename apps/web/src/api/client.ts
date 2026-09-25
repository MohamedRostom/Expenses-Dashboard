import type { ErrorCodeT } from '@desk/contracts';

/** Reads a cookie value by name, or null if absent/unavailable (e.g. SSR). */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

export class ApiError extends Error {
  code: ErrorCodeT;
  status: number;
  details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCodeT,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Parses a non-ok response body into an ApiError, falling back when it isn't the envelope shape. */
async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    if (body?.error?.code && body.error.message) {
      return new ApiError(
        body.error.code as ErrorCodeT,
        body.error.message,
        res.status,
        body.error.details,
      );
    }
  } catch {
    // fall through to generic error below — a non-JSON body (e.g. a proxy's 502 HTML page)
    // lands here, and 'validation_failed' would be actively misleading for a 5xx.
  }
  const code: ErrorCodeT = res.status >= 500 ? 'internal' : 'validation_failed';
  return new ApiError(code, res.statusText || 'Request failed', res.status);
}

/** Typed fetch wrapper: sends the CSRF header on mutating requests, parses the
 * error envelope on failure and throws ApiError. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('__Host-desk_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, method, headers, credentials: 'include' });
  if (!res.ok) throw await toApiError(res);
  // Several routes (register, forgot-password, email-change, feedback — see c.body(null, 202) in
  // apps/api/src/routes/{auth,me,feedback}.ts) reply 202 with no body, not 204. res.json() on an
  // empty body throws a SyntaxError, which callers can't distinguish from a real validation
  // error, so every one of those flows silently showed a generic "That didn't look right" banner
  // despite succeeding server-side. Read as text first so any empty-bodied 2xx returns undefined.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
