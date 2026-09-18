import type { ErrorCodeT } from '@desk/contracts';

/** Thrown by route handlers/middleware; errors.ts maps this to the ErrorEnvelope shape. */
export class ApiError extends Error {
  readonly code: ErrorCodeT;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCodeT,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
