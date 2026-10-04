import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLog, places as placesTable, setGlobalFlag } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

// T007: foundational widgets API (spec 003 contracts/api.md).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

const LONDON = {
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 51.5072,
  lon: -0.1276,
  timeZone: 'Europe/London',
};
const PARIS = {
  name: 'Paris',
  admin1: 'Île-de-France',
  country: 'France',
  lat: 48.8566,
  lon: 2.3522,
  timeZone: 'Europe/Paris',
};

describe('widgets', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    for (const k of ['currency', 'weather', 'sunrise', 'spend_pace', 'fixed_costs']) {
      await setGlobalFlag(h.db, `widgets.${k}`, true);
    }
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('GET /widgets for a new user is empty with the limit and unit', async () => {
    const u = await h.asUser('w-empty@example.com');
    const res = await u.get('/widgets');
    expect(res.status).toBe(200);
    expect(await j(res)).toEqual({ widgets: [], limit: 8, temperatureUnit: 'C' });
  });

  it('GET /widgets/types lists enabled kinds with name, description, needsPlace and schema', async () => {
    const u = await h.asUser('w-types@example.com');
    const { types } = await j(await u.get('/widgets/types'));
    expect(types.map((t: { kind: string }) => t.kind).sort()).toEqual(
      ['currency', 'fixed_costs', 'spend_pace', 'sunrise', 'weather'].sort(),
    );
    const weather = types.find((t: { kind: string }) => t.kind === 'weather');
    expect(weather).toMatchObject({ enabled: true, needsPlace: true });
    expect(weather.name).toBeTruthy();
    expect(weather.description).toBeTruthy();
    expect(weather.settingsSchema).toBeTruthy();
    expect(types.find((t: { kind: string }) => t.kind === 'currency').needsPlace).toBe(false);
  });

  it('a flag-off kind is listed (enabled false) only when the user has one, and the widget is unavailable', async () => {
    const u = await h.asUser('w-flagoff@example.com');
    const created = await u.post('/widgets', { kind: 'spend_pace' });
    expect(created.status).toBe(201);
    await setGlobalFlag(h.db, 'widgets.spend_pace', false);
    try {
      const { types } = await j(await u.get('/widgets/types'));
      const sp = types.find((t: { kind: string }) => t.kind === 'spend_pace');
      expect(sp.enabled).toBe(false);
      const other = await h.asUser('w-flagoff-other@example.com');
      const otherTypes = (await j(await other.get('/widgets/types'))).types;
      expect(otherTypes.find((t: { kind: string }) => t.kind === 'spend_pace')).toBeUndefined();

      const { widgets } = await j(await u.get('/widgets'));
      expect(widgets[0].state).toBe('unavailable');

      const blocked = await other.post('/widgets', { kind: 'spend_pace' });
      expect(blocked.status).toBe(404);
      expect((await j(blocked)).error.code).toBe('not_found');
    } finally {
      await setGlobalFlag(h.db, 'widgets.spend_pace', true);
    }
  });

  it('POST /widgets appends at the last position and answers 201', async () => {
    const u = await h.asUser('w-append@example.com');
    const a = await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD'] } });
    expect(a.status).toBe(201);
    const wa = (await j(a)).widget;
    expect(wa).toMatchObject({ kind: 'currency', position: 0, settings: { currencies: ['USD'] } });
    const b = (await j(await u.post('/widgets', { kind: 'spend_pace' }))).widget;
    expect(b.position).toBe(1);
    const list = (await j(await u.get('/widgets'))).widgets;
    expect(list.map((w: { id: string }) => w.id)).toEqual([wa.id, b.id]);
    expect(list[0]).toMatchObject({ state: 'error', cause: 'rate_unavailable' }); // no fx_rates row yet
    expect(list[1].state).toBe('empty');
  });

  it('the ninth widget answers 409 limit_reached', async () => {
    const u = await h.asUser('w-limit@example.com');
    for (let i = 0; i < 8; i++) {
      expect((await u.post('/widgets', { kind: 'spend_pace' })).status).toBe(201);
    }
    const res = await u.post('/widgets', { kind: 'spend_pace' });
    expect(res.status).toBe(409);
    expect((await j(res)).error.code).toBe('limit_reached');
  });

  it('bad settings answer 422 validation_failed', async () => {
    const u = await h.asUser('w-bad@example.com');
    for (const body of [
      { kind: 'currency', settings: { currencies: ['GBP'] } }, // the default
      { kind: 'currency', settings: { currencies: ['XXZ'] } }, // not convertible
      { kind: 'currency', settings: {} },
      { kind: 'weather' }, // missing place
    ]) {
      const res = await u.post('/widgets', body);
      expect(res.status).toBe(422);
      expect((await j(res)).error.code).toBe('validation_failed');
    }
    expect((await j(await u.get('/widgets'))).widgets).toEqual([]);
    expect(await h.db.select().from(placesTable).where(eq(placesTable.name, 'Nowhere'))).toEqual(
      [],
    );
  });

  it('PATCH /widgets/:id replaces settings, keeping a stored code that became the default', async () => {
    const u = await h.asUser('w-patch@example.com');
    const w = (
      await j(await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD'] } }))
    ).widget;
    const res = await u.patch(`/widgets/${w.id}`, { settings: { currencies: ['USD', 'EUR'] } });
    expect(res.status).toBe(200);
    expect((await j(res)).widget.settings).toEqual({ currencies: ['USD', 'EUR'] });
    const bad = await u.patch(`/widgets/${w.id}`, { settings: { currencies: ['USD', 'GBP'] } });
    expect(bad.status).toBe(422);
  });

  it('places are reused per rounded coordinates and PATCH place repoints only that widget', async () => {
    const u = await h.asUser('w-place@example.com');
    const w1 = (await j(await u.post('/widgets', { kind: 'weather', place: LONDON }))).widget;
    const w2 = (
      await j(await u.post('/widgets', { kind: 'sunrise', place: { ...LONDON, lat: 51.5062 } }))
    ).widget;
    expect(w1.place).toMatchObject({ name: 'London', lat: 51.51, lon: -0.13 });
    const userRows = async () =>
      (await h.db.select().from(placesTable).where(eq(placesTable.userId, u.userId))).length;
    expect(await userRows()).toBe(1);

    const res = await u.patch(`/widgets/${w1.id}`, { place: PARIS });
    expect(res.status).toBe(200);
    expect((await j(res)).widget.place.name).toBe('Paris');
    expect(await userRows()).toBe(2); // London kept: w2 still references it
    const list = (await j(await u.get('/widgets'))).widgets;
    expect(list.find((w: { id: string }) => w.id === w2.id).place.name).toBe('London');

    // repointing the last reference drops the old row
    await u.patch(`/widgets/${w2.id}`, { place: PARIS });
    expect(await userRows()).toBe(1);
  });

  it('DELETE /widgets/:id answers 204, drops an unreferenced place and audits widget.remove', async () => {
    const u = await h.asUser('w-delete@example.com');
    const w = (await j(await u.post('/widgets', { kind: 'weather', place: LONDON }))).widget;
    const res = await u.delete(`/widgets/${w.id}`);
    expect(res.status).toBe(204);
    expect((await j(await u.get('/widgets'))).widgets).toEqual([]);
    expect(await h.db.select().from(placesTable).where(eq(placesTable.userId, u.userId))).toEqual(
      [],
    );
    const audit = await h.db.select().from(auditLog).where(eq(auditLog.userId, u.userId));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['widget.add', 'widget.remove', 'place.removed']),
    );
    expect((await u.delete(`/widgets/${w.id}`)).status).toBe(404);
  });

  it('choosing a place on add and on change audits place.chosen without coordinates', async () => {
    const u = await h.asUser('w-place-audit@example.com');
    const w = (await j(await u.post('/widgets', { kind: 'weather', place: LONDON }))).widget;
    await u.patch(`/widgets/${w.id}`, { place: PARIS });
    await u.post('/widgets', { kind: 'sunrise', place: PARIS }); // reuses the existing row
    const chosen = (await h.db.select().from(auditLog).where(eq(auditLog.userId, u.userId))).filter(
      (a) => a.action === 'place.chosen',
    );
    expect(chosen).toHaveLength(3);
    expect(JSON.stringify(chosen.map((a) => a.details))).not.toMatch(/lat|lon/);
  });

  it('PATCH /me temperatureUnit is returned by GET /me and GET /widgets', async () => {
    const u = await h.asUser('w-unit@example.com');
    expect((await u.patch('/me', { temperatureUnit: 'F' })).status).toBe(200);
    expect((await j(await u.get('/me'))).user.temperatureUnit).toBe('F');
    expect((await j(await u.get('/widgets'))).temperatureUnit).toBe('F');
  });

  it('GET /me/export contains widgets with place details and no cached readings', async () => {
    const u = await h.asUser('w-export@example.com');
    await u.post('/widgets', { kind: 'weather', place: LONDON });
    await u.post('/widgets', { kind: 'sunrise', place: LONDON });
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD'] } });
    const doc = await j(await u.get('/me/export'));
    expect(doc.widgets).toEqual([
      {
        kind: 'weather',
        position: 0,
        settings: {},
        place: {
          name: 'London',
          admin1: 'England',
          country: 'United Kingdom',
          lat: 51.51,
          lon: -0.13,
        },
      },
      {
        kind: 'sunrise',
        position: 1,
        settings: {},
        place: {
          name: 'London',
          admin1: 'England',
          country: 'United Kingdom',
          lat: 51.51,
          lon: -0.13,
        },
      },
      { kind: 'currency', position: 2, settings: { currencies: ['USD'] } },
    ]);
    expect(JSON.stringify(doc)).not.toContain('weather_readings');
  });

  describe('arrange (T049, T068, T070)', () => {
    type U = Awaited<ReturnType<Harness['asUser']>>;
    const seed = async (u: U, n: number) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        ids.push((await j(await u.post('/widgets', { kind: 'spend_pace' }))).widget.id);
      }
      return ids;
    };
    const order = async (u: U) =>
      (await j(await u.get('/widgets'))).widgets.map((w: { id: string }) => w.id);

    it('PUT /widgets/order persists the new order, returns the list and audits widget.reorder', async () => {
      const u = await h.asUser('w-reorder@example.com');
      const [a, b, c] = await seed(u, 3);
      const res = await u.put('/widgets/order', { ids: [c, a, b] });
      expect(res.status).toBe(200);
      expect((await j(res)).widgets.map((w: { id: string }) => w.id)).toEqual([c, a, b]);
      expect(await order(u)).toEqual([c, a, b]);
      const audit = await h.db.select().from(auditLog).where(eq(auditLog.userId, u.userId));
      expect(audit.map((r) => r.action)).toContain('widget.reorder');
      expect((await u.put('/widgets/order', { ids: [b, c, a] })).status).toBe(200);
      expect(await order(u)).toEqual([b, c, a]);
    });

    it('PUT /widgets/order: foreign or unknown id is 404, missing or repeated id is 422', async () => {
      const u = await h.asUser('w-reorder-bad@example.com');
      const other = await h.asUser('w-reorder-other@example.com');
      const [a, b] = await seed(u, 2);
      const [foreign] = await seed(other, 1);
      const code = async (ids: string[]) => {
        const r = await u.put('/widgets/order', { ids });
        return [r.status, (await j(r)).error.code];
      };
      expect(await code([a!, foreign!])).toEqual([404, 'not_found']);
      expect(await code([a!, b!, foreign!])).toEqual([404, 'not_found']);
      expect(await code([a!, crypto.randomUUID()])).toEqual([404, 'not_found']);
      expect(await code([a!])).toEqual([422, 'validation_failed']);
      expect(await code([a!, a!, b!])).toEqual([422, 'validation_failed']);
      expect(await order(u)).toEqual([a, b]);
    });

    it('duplicateOf copies kind, settings and place at the last position and counts toward the limit', async () => {
      const u = await h.asUser('w-dup@example.com');
      const w = (await j(await u.post('/widgets', { kind: 'weather', place: LONDON }))).widget;
      const res = await u.post('/widgets', { kind: 'weather', duplicateOf: w.id });
      expect(res.status).toBe(201);
      const d = (await j(res)).widget;
      expect(d.id).not.toBe(w.id);
      expect(d.position).toBe(1);
      expect(d.place).toEqual(w.place);
      expect(
        await h.db.select().from(placesTable).where(eq(placesTable.userId, u.userId)),
      ).toHaveLength(1);
      const audit = await h.db.select().from(auditLog).where(eq(auditLog.userId, u.userId));
      expect(audit.find((r) => r.action === 'widget.add' && r.subject === d.id)?.details).toEqual({
        kind: 'weather',
        duplicateOf: w.id,
      });
      await seed(u, 6);
      expect((await u.post('/widgets', { kind: 'weather', duplicateOf: w.id })).status).toBe(409);
    });

    it('duplicating a currency widget whose code became the default succeeds (T070)', async () => {
      const u = await h.asUser('w-dup-cur@example.com');
      const w = (
        await j(await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD'] } }))
      ).widget;
      await h.db.execute(
        sql`UPDATE widgets SET settings = '{"currencies":["GBP"]}'::jsonb WHERE id = ${w.id}`,
      );
      const res = await u.post('/widgets', { kind: 'currency', duplicateOf: w.id });
      expect(res.status).toBe(201);
      expect((await j(res)).widget.settings).toEqual({ currencies: ['GBP'] });
    });

    it('a sunrise widget without a place takes the first weather widget place and keeps it (T068)', async () => {
      const u = await h.asUser('w-sun-fallback@example.com');
      const none = await u.post('/widgets', { kind: 'sunrise' });
      expect(none.status).toBe(422);
      const err = (await j(none)).error;
      expect(err.code).toBe('validation_failed');
      expect(JSON.stringify(err.details)).toContain('place_required');

      const wx = (await j(await u.post('/widgets', { kind: 'weather', place: LONDON }))).widget;
      await u.post('/widgets', { kind: 'weather', place: PARIS });
      const sun = (await j(await u.post('/widgets', { kind: 'sunrise' }))).widget;
      expect(sun.place.name).toBe('London');
      await u.patch(`/widgets/${wx.id}`, { place: PARIS });
      const list = (await j(await u.get('/widgets'))).widgets;
      expect(list.find((x: { id: string }) => x.id === sun.id).place.name).toBe('London');
    });
  });

  describe('input validation is 422', () => {
    it('rejects a bogus time zone and an over-long name in place', async () => {
      const u = await h.asUser('w-badplace@example.com');
      for (const place of [
        { ...LONDON, timeZone: 'bogus' },
        { ...LONDON, name: 'x'.repeat(101) },
      ]) {
        const res = await u.post('/widgets', { kind: 'weather', place });
        expect(res.status).toBe(422);
        expect((await j(res)).error.code).toBe('validation_failed');
      }
    });

    it('PUT /widgets/order {} and POST /widgets {kind:"nope"} are 422, not 400', async () => {
      const u = await h.asUser('w-422@example.com');
      for (const res of [
        await u.put('/widgets/order', {}),
        await u.post('/widgets', { kind: 'nope' }),
      ]) {
        expect(res.status).toBe(422);
        expect((await j(res)).error.code).toBe('validation_failed');
      }
    });
  });
});
