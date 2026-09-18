// T039: BreachChecker — k-anonymity range lookup against the HaveIBeenPwned Pwned Passwords API.
// Uses global fetch + WebCrypto SHA-1 (both available in Node and Workers runtimes).
export interface BreachChecker {
  /** Resolves true when the password appears in a known breach corpus (refuse it). */
  check(password: string): Promise<boolean>;
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Real implementation: SHA-1 prefix (5 chars) sent to the range API, suffix matched locally. */
export class HibpBreachChecker implements BreachChecker {
  async check(password: string): Promise<boolean> {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) {
      // ponytail: fail-open on provider outage — rate_unavailable is for RatesProvider, not this;
      // refusing every signup because HIBP is down is worse than letting a weak-but-unbreached
      // password through. Upgrade path: surface a warning banner instead of a hard block.
      return false;
    }
    const body = await res.text();
    return body.split('\n').some((line) => line.trim().split(':')[0] === suffix);
  }
}

/** Test double: flags a couple of well-known breached passwords, everything else is clean. */
export class FakeBreachChecker implements BreachChecker {
  private readonly breached = new Set(['password123456', 'letmein12345', 'qwertyuiop123']);

  async check(password: string): Promise<boolean> {
    return this.breached.has(password);
  }
}
