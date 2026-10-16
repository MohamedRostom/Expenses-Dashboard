import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MOTION_PRESET_IDS } from '@desk/contracts';
import { startHarness, type Harness } from './harness.js';

// T013: spec 006 appearance fields on GET/PATCH /me and /me/export.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

describe('me appearance (spec 006)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('GET /me returns the defaults', async () => {
    const user = await h.asUser('app-defaults@example.com');
    const body = await j(await user.get('/me'));
    expect(body.user).toMatchObject({
      motionPreset: 'particles',
      motionColour: '#7fd1a8',
      panelsTranslucent: true,
      motionPaused: false,
    });
  });

  it('PATCH /me sets every preset, lowercases the colour and round-trips', async () => {
    const user = await h.asUser('app-patch@example.com');
    for (const id of MOTION_PRESET_IDS) {
      const res = await user.patch('/me', { motionPreset: id });
      expect(res.status).toBe(200);
      expect((await j(res)).user.motionPreset).toBe(id);
    }
    const res = await user.patch('/me', {
      motionColour: '#AABBCC',
      panelsTranslucent: false,
      motionPaused: true,
    });
    expect(res.status).toBe(200);
    const expected = {
      motionColour: '#aabbcc',
      panelsTranslucent: false,
      motionPaused: true,
    };
    expect((await j(res)).user).toMatchObject(expected);
    expect((await j(await user.get('/me'))).user).toMatchObject(expected);
    expect((await j(await user.get('/me/export'))).user).toMatchObject(expected);
  });

  it.each([
    { motionPreset: 'confetti' },
    { motionColour: 'red' },
    { motionColour: '#12345' },
    { panelsTranslucent: 'yes' },
    { motionPaused: 1 },
  ])('PATCH /me rejects %o with 400 and changes nothing', async (bad) => {
    const user = await h.asUser(
      `app-bad-${JSON.stringify(bad).length}-${Object.keys(bad)[0]}@example.com`,
    );
    const res = await user.patch('/me', bad);
    expect(res.status).toBe(400);
    expect((await j(res)).error.code).toBe('validation_failed');
    expect((await j(await user.get('/me'))).user).toMatchObject({
      motionPreset: 'particles',
      motionColour: '#7fd1a8',
      panelsTranslucent: true,
      motionPaused: false,
    });
  });

  it('signed out: GET /me and PATCH /me answer 401', async () => {
    expect((await h.app.request('/me')).status).toBe(401);
    const res = await h.app.request('/me', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: '__Host-desk_csrf=t',
        'x-csrf-token': 't',
      },
      body: JSON.stringify({ motionPaused: true }),
    });
    expect(res.status).toBe(401);
  });
});
