// T016: AES-256-GCM via WebCrypto — available in both Node and Workers runtimes.
export interface SecretBox {
  seal(plaintext: string): Promise<string>;
  open(ciphertext: string): Promise<string>;
}

const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(
  base64Key: string,
): Promise<Awaited<ReturnType<typeof crypto.subtle.importKey>>> {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) {
    throw new RangeError(`SecretBox: key must decode to 32 bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Creates a SecretBox from a 32-byte base64 key (matches SECRET_BOX_KEY in .env.example). */
export function createSecretBox(base64Key: string): SecretBox {
  const keyPromise = importKey(base64Key);
  return {
    async seal(plaintext) {
      const key = await keyPromise;
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(plaintext),
        ),
      );
      const combined = new Uint8Array(iv.length + ciphertext.length);
      combined.set(iv, 0);
      combined.set(ciphertext, iv.length);
      return toBase64(combined);
    },
    async open(ciphertext) {
      const key = await keyPromise;
      const combined = fromBase64(ciphertext);
      const iv = combined.slice(0, IV_BYTES);
      const data = combined.slice(IV_BYTES);
      try {
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(plaintext);
      } catch {
        throw new Error('SecretBox: failed to open ciphertext (tampered or wrong key)');
      }
    },
  };
}
