import type { SecretBox } from '../adapters/secret-box.js';

/**
 * Seal a credential (containing refreshToken) into an encrypted Uint8Array.
 */
export async function sealCredential(
  box: SecretBox,
  cred: { refreshToken: string },
): Promise<Uint8Array> {
  return new TextEncoder().encode(await box.seal(JSON.stringify(cred)));
}

/**
 * Open (decrypt and parse) a sealed credential.
 */
export async function openCredential(
  box: SecretBox,
  bytes: Uint8Array,
): Promise<{ refreshToken: string }> {
  return JSON.parse(await box.open(new TextDecoder().decode(bytes)));
}

/**
 * Build OAuth endpoint overrides for Google, given an optional base URL.
 * Base convention: Google base B → authorize `${B}/o/oauth2/v2/auth`, token `${B}/token`, revoke `${B}/revoke`.
 *
 * `browserBase`, when given, overrides only the `authorize` URL — the one sent to the browser
 * as a 302 redirect. `base` is used as-is for `token`/`revoke`, which the api container calls
 * itself. This lets compose point the server-to-server calls at a docker-network name (`mocks`)
 * while the browser-facing authorize URL uses a host-reachable one (e.g. `localhost`).
 */
export function googleOAuthEndpoints(
  base?: string,
  browserBase?: string,
): {
  authorize?: string;
  token?: string;
  revoke?: string;
} {
  const authorizeBase = browserBase ?? base;
  return {
    ...(authorizeBase && { authorize: `${authorizeBase}/o/oauth2/v2/auth` }),
    ...(base && { token: `${base}/token`, revoke: `${base}/revoke` }),
  };
}

/**
 * Build OAuth endpoint overrides for Microsoft, given an optional base URL.
 * Base convention: Microsoft base B → `${B}/common/oauth2/v2.0/authorize`, `${B}/common/oauth2/v2.0/token`.
 *
 * `browserBase` overrides only `authorize`, for the same reason as `googleOAuthEndpoints` above.
 */
export function microsoftOAuthEndpoints(
  base?: string,
  browserBase?: string,
): {
  authorize?: string;
  token?: string;
} {
  const authorizeBase = browserBase ?? base;
  return {
    ...(authorizeBase && { authorize: `${authorizeBase}/common/oauth2/v2.0/authorize` }),
    ...(base && { token: `${base}/common/oauth2/v2.0/token` }),
  };
}
