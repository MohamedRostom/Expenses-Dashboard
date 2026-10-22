import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setGlobalFlag, setUserFlag } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

describe('GET /flags/public (spec 006 T014)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  it('answers signed out with only appearance.motion and a Cache-Control header', async () => {
    await setGlobalFlag(harness.db, 'appearance.motion', false);
    await setGlobalFlag(harness.db, 'panels.today', true);
    const res = await harness.app.request('/flags/public');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ flags: { 'appearance.motion': false } });
  });

  it('returns the global value, ignoring a per-user override', async () => {
    const user = await harness.asUser('flags-public@test.com');
    await setGlobalFlag(harness.db, 'appearance.motion', false);
    await setUserFlag(harness.db, 'flags-public@test.com', 'appearance.motion', true);
    expect(
      ((await (await user.get('/flags')).json()) as { flags: Record<string, boolean> }).flags[
        'appearance.motion'
      ],
    ).toBe(true);

    const res = await user.get('/flags/public');
    expect(await res.json()).toEqual({ flags: { 'appearance.motion': false } });

    await setGlobalFlag(harness.db, 'appearance.motion', true);
    const on = await harness.app.request('/flags/public');
    expect(await on.json()).toEqual({ flags: { 'appearance.motion': true } });
  });
});
