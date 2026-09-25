import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export type CspNonceVariables = { cspNonce: string };

/** Base64-encoded 16 random bytes — used as the per-request CSP nonce. */
function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Per-request CSP nonce (c.set('cspNonce', ...), read by node.ts to inject into index.html) plus
 * Hono's secureHeaders with a one-year HSTS (research.md R11; preload deferred past beta).
 */
export const secureHeadersMiddleware: MiddlewareHandler<{ Variables: CspNonceVariables }> = async (
  c,
  next,
) => {
  const nonce = randomNonce();
  c.set('cspNonce', nonce);

  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", `'nonce-${nonce}'`],
      styleSrc: ["'self'", `'nonce-${nonce}'`],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    strictTransportSecurity: 'max-age=31536000',
  })(c, next);
};
