import { startHarness, type Harness } from './harness.js';

// Proves the harness itself: two users, cookie + CSRF round trip. Real route tests build on this.
describe('test harness', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it('asUser() creates distinct users and /healthz responds for either', async () => {
    const a = await harness.asUser('harness-a@example.com');
    const b = await harness.asUser('harness-b@example.com');
    expect(a.userId).not.toBe(b.userId);

    const resA = await a.get('/healthz');
    expect(resA.status).toBe(200);
    expect(await resA.json()).toMatchObject({ status: 'ok' });

    const resB = await b.get('/healthz');
    expect(resB.status).toBe(200);
  });

  it('asUser() is idempotent for the same email', async () => {
    const first = await harness.asUser('harness-repeat@example.com');
    const second = await harness.asUser('harness-repeat@example.com');
    expect(second.userId).toBe(first.userId);
  });
});
