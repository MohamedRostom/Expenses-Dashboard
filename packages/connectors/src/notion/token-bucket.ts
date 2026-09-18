/** Minimal in-memory token bucket: `capacity` tokens refilling at `ratePerSecond`, per
 * NotionClient instance — this connector is per-user-connection, so no cross-instance
 * coordination is needed (research.md R8). */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number = ratePerSecond,
  ) {
    this.tokens = capacity;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSecond);
    this.lastRefill = now;
  }

  /** Resolves once a token is available, consuming it. */
  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.ratePerSecond) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 1)));
    }
  }
}
