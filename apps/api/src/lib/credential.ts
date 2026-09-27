import type { SecretBox } from '../adapters/secret-box.js';

/** Sealed shape for a `standards` (IMAP/CalDAV) connected account — services/connections.ts
 * (T070) seals it on connect/reconnect, jobs/panels-refresh.ts opens it to build the IMAP/CalDAV
 * credential each source expects. Never returned by the API (contracts/api.md). */
export interface StandardsCredential {
  password: string;
  imapHost?: string;
  imapPort?: number;
  caldavUrl?: string;
}

/**
 * Seal a credential into an encrypted Uint8Array. Generic over the credential shape: OAuth
 * providers seal `{ refreshToken }` (the default and only shape before T070); standards accounts
 * seal `{ password, imapHost, imapPort, caldavUrl }` (services/connections.ts, jobs/panels-refresh.ts).
 */
export async function sealCredential<T extends object = { refreshToken: string }>(
  box: SecretBox,
  cred: T,
): Promise<Uint8Array> {
  return new TextEncoder().encode(await box.seal(JSON.stringify(cred)));
}

/**
 * Open (decrypt and parse) a sealed credential. Same generic as sealCredential — pass the type
 * argument at the call site when the stored shape isn't the `{ refreshToken }` default.
 */
export async function openCredential<T = { refreshToken: string }>(
  box: SecretBox,
  bytes: Uint8Array,
): Promise<T> {
  return JSON.parse(await box.open(new TextDecoder().decode(bytes))) as T;
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
