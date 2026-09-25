import { argon2id, argon2Verify } from 'hash-wasm';

// T012: Argon2id per research.md R-params. hash-wasm runs in Workers and Node alike (WASM, no native addon).
const PARAMS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19 * 1024,
  hashLength: 32,
  outputType: 'encoded' as const,
};

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  /** True when `hash` was produced with different parameters than PARAMS (rehash-on-login). */
  needsRehash(hash: string): boolean;
}

function paramsFromEncoded(hash: string): {
  m: number | undefined;
  t: number | undefined;
  p: number | undefined;
} {
  // $argon2id$v=19$m=19456,t=2,p=1$salt$digest
  const segment = hash.split('$').find((s) => s.startsWith('m='));
  const out: Record<string, number> = {};
  if (segment) {
    for (const pair of segment.split(',')) {
      const [k, v] = pair.split('=');
      if (k) out[k] = Number(v);
    }
  }
  return { m: out.m, t: out.t, p: out.p };
}

export const passwordHasher: PasswordHasher = {
  async hash(password) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return argon2id({ password, salt, ...PARAMS });
  },
  async verify(password, hash) {
    return argon2Verify({ password, hash });
  },
  needsRehash(hash) {
    const { m, t, p } = paramsFromEncoded(hash);
    return m !== PARAMS.memorySize || t !== PARAMS.iterations || p !== PARAMS.parallelism;
  },
};
