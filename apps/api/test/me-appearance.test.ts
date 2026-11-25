import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FONT_IDS, MOTION_PRESET_IDS } from '@desk/contracts';
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

  describe('free colours (ADR-0008)', () => {
    const NULLS = { accentCustom: null, groundTint: null, navColour: null };

    it('GET /me returns null for each by default', async () => {
      const user = await h.asUser('fc-defaults@example.com');
      expect((await j(await user.get('/me'))).user).toMatchObject(NULLS);
    });

    it('PATCH stores lowercase, round-trips on GET and export, and null resets one field only', async () => {
      const user = await h.asUser('fc-patch@example.com');
      const res = await user.patch('/me', {
        accentCustom: '#AABBCC',
        groundTint: '#A8501F',
        navColour: '#00FF99',
      });
      expect(res.status).toBe(200);
      const set = { accentCustom: '#aabbcc', groundTint: '#a8501f', navColour: '#00ff99' };
      expect((await j(res)).user).toMatchObject(set);
      expect((await j(await user.get('/me'))).user).toMatchObject(set);
      expect((await j(await user.get('/me/export'))).user).toMatchObject(set);

      const reset = await user.patch('/me', { groundTint: null });
      expect((await j(reset)).user).toMatchObject({ ...set, groundTint: null });
      const all = await user.patch('/me', NULLS);
      expect((await j(all)).user).toMatchObject(NULLS);
    });

    it('PATCH without any colour field leaves the stored colours untouched', async () => {
      const user = await h.asUser('fc-omit@example.com');
      const set = { accentCustom: '#aabbcc', groundTint: '#a8501f', navColour: '#00ff99' };
      await user.patch('/me', set);
      const res = await user.patch('/me', { motionPaused: true });
      expect(res.status).toBe(200);
      expect((await j(res)).user).toMatchObject(set);
      expect((await j(await user.get('/me'))).user).toMatchObject(set);
    });

    it.each([{ accentCustom: 'red' }, { groundTint: '#12345' }, { navColour: 7 }])(
      'PATCH rejects %o with 400 and changes nothing',
      async (bad) => {
        const user = await h.asUser(`fc-bad-${Object.keys(bad)[0]}@example.com`);
        const res = await user.patch('/me', bad);
        expect(res.status).toBe(400);
        expect((await j(res)).error.code).toBe('validation_failed');
        expect((await j(await user.get('/me'))).user).toMatchObject(NULLS);
      },
    );

    it('signed out: PATCH answers 401', async () => {
      const res = await h.app.request('/me', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: '__Host-desk_csrf=t',
          'x-csrf-token': 't',
        },
        body: JSON.stringify({ accentCustom: '#aabbcc' }),
      });
      expect(res.status).toBe(401);
    });
  });
});

describe('me font (page font setting)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('defaults to the system font', async () => {
    const user = await h.asUser('font-default@example.com');
    expect((await j(await user.get('/me'))).user.font).toBe('system');
  });

  it('PATCH /me sets every font and it round-trips through /me and the export', async () => {
    const user = await h.asUser('font-patch@example.com');
    for (const id of FONT_IDS) {
      const res = await user.patch('/me', { font: id });
      expect(res.status).toBe(200);
      expect((await j(res)).user.font).toBe(id);
    }
    await user.patch('/me', { font: 'serif' });
    expect((await j(await user.get('/me'))).user.font).toBe('serif');
    expect((await j(await user.get('/me/export'))).user.font).toBe('serif');
  });

  it('rejects an unknown font with 400 and keeps the saved one', async () => {
    const user = await h.asUser('font-bad@example.com');
    const res = await user.patch('/me', { font: 'comic-sans' });
    expect(res.status).toBe(400);
    expect((await j(await user.get('/me'))).user.font).toBe('system');
  });
});
