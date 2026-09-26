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
 */
export function googleOAuthEndpoints(base?: string): {
  authorize?: string;
  token?: string;
  revoke?: string;
} {
  if (!base) return {};
  return {
    authorize: `${base}/o/oauth2/v2/auth`,
    token: `${base}/token`,
    revoke: `${base}/revoke`,
  };
}

/**
 * Build OAuth endpoint overrides for Microsoft, given an optional base URL.
 * Base convention: Microsoft base B → `${B}/common/oauth2/v2.0/authorize`, `${B}/common/oauth2/v2.0/token`.
 */
export function microsoftOAuthEndpoints(base?: string): {
  authorize?: string;
  token?: string;
} {
  if (!base) return {};
  return {
    authorize: `${base}/common/oauth2/v2.0/authorize`,
    token: `${base}/common/oauth2/v2.0/token`,
  };
}
