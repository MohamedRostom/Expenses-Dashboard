import { describe, it, expect, afterAll } from 'vitest';
import { startHarness, type Harness } from './harness.js';

// The per-IP sign-up limit defaults to 20 an hour; compose raises it so the e2e-ci suite, which
// signs up every test's user from one runner IP, doesn't hit it (registerIpLimitPerHour).
const headers = {
  'content-type': 'application/json',
  'x-csrf-token': 'test-csrf-token',
  cookie: '__Host-desk_csrf=test-csrf-token',
};

async function registerMany(h: Harness, n: number, tag: string): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await h.app.request('/auth/register', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: `${tag}-${i}@example.test`,
        password: 'a-good-long-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    statuses.push(res.status);
  }
  return statuses;
}

describe('POST /auth/register per-IP limit', () => {
  const harnesses: Harness[] = [];
  afterAll(async () => {
    await Promise.all(harnesses.map((h) => h.close()));
  });

  it('refuses the 21st sign-up from one IP within an hour by default', async () => {
    const h = await startHarness();
    harnesses.push(h);
    expect(await registerMany(h, 21, 'default')).toEqual([...Array(20).fill(202), 429]);
  }, 180_000);

  it('uses registerIpLimitPerHour when given', async () => {
    const h = await startHarness(undefined, { registerIpLimitPerHour: 3 });
    harnesses.push(h);
    expect(await registerMany(h, 4, 'override')).toEqual([202, 202, 202, 429]);
  }, 180_000);
});
