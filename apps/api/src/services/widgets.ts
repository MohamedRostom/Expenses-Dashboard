import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  auditLog,
  places as placesTable,
  weatherReadings,
  widgets as widgetsTable,
  type Db,
} from '@desk/db';
import type {
  PlaceCandidateT,
  WidgetCreateT,
  WidgetPatchT,
  WidgetTypeT,
  WidgetKindT,
} from '@desk/contracts';
import {
  CURRENCIES,
  WIDGET_KINDS,
  WIDGET_LIMIT,
  settingsDescriptor,
  validateSettings,
} from '@desk/core';
import { ApiError } from '../lib/api-error.js';
import type { SessionUser } from '../middleware/session.js';
import { enqueueIfShort } from '../jobs/widgets-rates-backfill.js';
import { todayInTimeZone } from './capture.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Q = Db | Tx;

export type WidgetRow = {
  id: string;
  kind: WidgetKindT;
  position: number;
  settings: Record<string, unknown>;
  place?: PlaceCandidateT;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE_INFO: Record<WidgetKindT, { name: string; description: string }> = {
  currency: {
    name: 'Currency rates',
    description: 'Rates for up to six currencies against yours.',
  },
  weather: { name: 'Weather', description: 'Current weather and a three-day outlook.' },
  sunrise: { name: 'Sunrise and sunset', description: 'Sunrise, sunset and daylight for a place.' },
  spend_pace: { name: 'Spend pace', description: 'This month against budget.' },
  fixed_costs: {
    name: 'Fixed costs left',
    description: 'Fixed costs not yet recorded this month.',
  },
};

const convertible: ReadonlySet<string> = new Set(CURRENCIES.map((c) => c.code));

const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

async function audit(q: Q, userId: string, action: string, subject: string, details?: object) {
  await q.insert(auditLog).values({
    userId,
    actor: 'user',
    action,
    subject,
    ...(details && { details }),
  });
}

function toRow(
  w: typeof widgetsTable.$inferSelect,
  p: typeof placesTable.$inferSelect | null,
): WidgetRow {
  return {
    id: w.id,
    kind: w.kind as WidgetKindT,
    position: w.position,
    settings: w.settings as Record<string, unknown>,
    ...(p && {
      place: {
        name: p.name,
        admin1: p.admin1,
        country: p.country,
        lat: Number(p.lat),
        lon: Number(p.lon),
        timeZone: p.timeZone,
      },
    }),
  };
}

/** Reuse-or-insert on the user's rounded (lat, lon); an existing row is never updated. */
async function ensurePlace(q: Q, userId: string, place: PlaceCandidateT): Promise<string> {
  const lat = round2(place.lat);
  const lon = round2(place.lon);
  const find = async () =>
    (
      await q
        .select({ id: placesTable.id })
        .from(placesTable)
        .where(
          and(eq(placesTable.userId, userId), eq(placesTable.lat, lat), eq(placesTable.lon, lon)),
        )
        .limit(1)
    )[0]?.id;
  const existing = await find();
  if (existing) return existing;
  await q
    .insert(placesTable)
    .values({
      userId,
      name: place.name,
      admin1: place.admin1,
      country: place.country,
      timeZone: place.timeZone,
      lat,
      lon,
    })
    .onConflictDoNothing();
  return (await find())!;
}

async function ownedPlaceId(q: Q, userId: string, id: string): Promise<string> {
  const [row] = UUID.test(id)
    ? await q
        .select({ id: placesTable.id })
        .from(placesTable)
        .where(and(eq(placesTable.id, id), eq(placesTable.userId, userId)))
    : [];
  if (!row) throw new ApiError('not_found', 'Place not found', 404);
  return row.id;
}

/** Deletes the place when no widget references it any more. */
async function dropIfUnreferenced(q: Q, userId: string, placeId: string | null) {
  if (!placeId) return;
  const [ref] = await q
    .select({ id: widgetsTable.id })
    .from(widgetsTable)
    .where(and(eq(widgetsTable.userId, userId), eq(widgetsTable.placeId, placeId)))
    .limit(1);
  if (ref) return;
  await q
    .delete(placesTable)
    .where(and(eq(placesTable.id, placeId), eq(placesTable.userId, userId)));
  await audit(q, userId, 'place.removed', placeId);
}

function check(
  user: SessionUser,
  kind: WidgetKindT,
  settings: unknown,
  previous: string[],
  placeId: string | null,
) {
  const issues = validateSettings(kind, settings, {
    defaultCurrency: user.defaultCurrency,
    convertible,
    previous,
    placeId,
  });
  if (issues.length > 0) {
    throw new ApiError(
      'validation_failed',
      'Invalid widget settings',
      422,
      Object.fromEntries(issues.map((i) => [i.path || '(root)', i.message])),
    );
  }
}

const codesOf = (settings: unknown): string[] => {
  const c = (settings as { currencies?: unknown } | null)?.currencies;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : [];
};

export function createWidgetsService(db: Db, clock: { now(): Date } = { now: () => new Date() }) {
  /** T029: queue a rates backfill for each code whose fx_rates history is short. */
  const backfill = (user: SessionUser, settings: unknown) =>
    enqueueIfShort(
      db,
      codesOf(settings),
      user.defaultCurrency,
      todayInTimeZone(user.timeZone, clock.now()),
    );

  const base = (q: Q) =>
    q
      .select({ w: widgetsTable, p: placesTable })
      .from(widgetsTable)
      .leftJoin(placesTable, eq(widgetsTable.placeId, placesTable.id));
  const select = (q: Q, userId: string) =>
    base(q).where(eq(widgetsTable.userId, userId)).orderBy(asc(widgetsTable.position));

  async function load(q: Q, userId: string, id: string) {
    const [row] = UUID.test(id)
      ? await base(q).where(and(eq(widgetsTable.userId, userId), eq(widgetsTable.id, id)))
      : [];
    if (!row) throw new ApiError('not_found', 'Widget not found', 404);
    return row;
  }

  return {
    async list(user: SessionUser): Promise<WidgetRow[]> {
      return (await select(db, user.id)).map((r) => toRow(r.w, r.p));
    },

    async typesFor(user: SessionUser, flags: Record<string, boolean>): Promise<WidgetTypeT[]> {
      const owned = new Set(
        (
          await db
            .select({ k: widgetsTable.kind })
            .from(widgetsTable)
            .where(eq(widgetsTable.userId, user.id))
        ).map((r) => r.k),
      );
      return WIDGET_KINDS.filter((kind) => flags[`widgets.${kind}`] || owned.has(kind)).map(
        (kind) => ({
          kind,
          ...TYPE_INFO[kind],
          enabled: !!flags[`widgets.${kind}`],
          needsPlace: settingsDescriptor(kind).requiresPlace,
          settingsSchema: { ...settingsDescriptor(kind) },
        }),
      );
    },

    async create(
      user: SessionUser,
      body: WidgetCreateT,
      flags: Record<string, boolean>,
    ): Promise<WidgetRow> {
      if (!flags[`widgets.${body.kind}`]) {
        throw new ApiError('not_found', 'This feature is not available', 404);
      }
      // ponytail: count-then-insert can race two concurrent adds past the cap; the deferred
      // unique (user_id, position) catches a position clash. Lock the user row if it matters.
      const row = await db.transaction(async (tx) => {
        const rows = await select(tx, user.id);
        if (rows.length >= WIDGET_LIMIT) {
          throw new ApiError('limit_reached', `At most ${WIDGET_LIMIT} widgets`, 409);
        }
        let settings = body.settings;
        let placeId: string | null = null;
        let previous: string[] = [];
        if (body.duplicateOf) {
          const src = await load(tx, user.id, body.duplicateOf);
          if (src.w.kind !== body.kind) {
            throw new ApiError('validation_failed', 'duplicateOf has a different kind', 422);
          }
          settings ??= src.w.settings as Record<string, unknown>;
          placeId = src.w.placeId;
          previous = codesOf(src.w.settings);
        }
        if (body.place) placeId = await ensurePlace(tx, user.id, body.place);
        else if (body.placeId) placeId = await ownedPlaceId(tx, user.id, body.placeId);
        if (body.kind === 'sunrise' && !placeId) {
          // contracts/api.md: a sunrise widget with no place takes the first weather widget's.
          placeId = rows.find((r) => r.w.kind === 'weather' && r.w.placeId)?.w.placeId ?? null;
          if (!placeId) {
            throw new ApiError('validation_failed', 'Invalid widget settings', 422, {
              place_id: 'place_required',
            });
          }
        }

        settings ??= {};
        check(user, body.kind, settings, previous, placeId);

        const position = rows.reduce((m, r) => Math.max(m, r.w.position + 1), 0);
        const [w] = await tx
          .insert(widgetsTable)
          .values({ userId: user.id, kind: body.kind, position, settings, placeId })
          .returning();
        await audit(tx, user.id, 'widget.add', w!.id, {
          kind: body.kind,
          ...(body.duplicateOf && { duplicateOf: body.duplicateOf }),
        });
        const r = await load(tx, user.id, w!.id);
        return toRow(r.w, r.p);
      });
      await backfill(user, row.settings);
      return row;
    },

    async patch(user: SessionUser, id: string, body: WidgetPatchT): Promise<WidgetRow> {
      const row = await db.transaction(async (tx) => {
        const { w } = await load(tx, user.id, id);
        const kind = w.kind as WidgetKindT;
        let placeId = w.placeId;
        if (body.place) placeId = await ensurePlace(tx, user.id, body.place);
        else if (body.placeId) placeId = await ownedPlaceId(tx, user.id, body.placeId);

        const settings = body.settings ?? w.settings;
        check(user, kind, settings, codesOf(w.settings), placeId);

        await tx
          .update(widgetsTable)
          .set({ settings, placeId, updatedAt: new Date() })
          .where(eq(widgetsTable.id, w.id));
        if (placeId !== w.placeId) await dropIfUnreferenced(tx, user.id, w.placeId);
        const r = await load(tx, user.id, id);
        return toRow(r.w, r.p);
      });
      await backfill(user, row.settings);
      return row;
    },

    async remove(user: SessionUser, id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const { w } = await load(tx, user.id, id);
        await tx.delete(widgetsTable).where(eq(widgetsTable.id, w.id));
        await audit(tx, user.id, 'widget.remove', w.id, { kind: w.kind });
        await dropIfUnreferenced(tx, user.id, w.placeId);
      });
    },

    /** The caller's widgets in `ids` order. A foreign id is 404, checked before the set check. */
    async reorder(user: SessionUser, ids: string[]): Promise<WidgetRow[]> {
      await db.transaction(async (tx) => {
        const owned = (await select(tx, user.id)).map((r) => r.w.id);
        const set = new Set(owned);
        if (ids.some((id) => !set.has(id))) {
          throw new ApiError('not_found', 'Widget not found', 404);
        }
        if (new Set(ids).size !== ids.length || ids.length !== owned.length) {
          throw new ApiError('validation_failed', 'ids must list every widget exactly once', 422);
        }
        // the (user_id, position) unique is deferred, so intermediate clashes are fine
        for (const [position, id] of ids.entries()) {
          await tx.update(widgetsTable).set({ position }).where(eq(widgetsTable.id, id));
        }
        await audit(tx, user.id, 'widget.reorder', user.id);
      });
      return (await select(db, user.id)).map((r) => toRow(r.w, r.p));
    },

    /** T067: make the readings behind the caller's places due for the next refresh job. */
    async markDue(user: SessionUser): Promise<number> {
      const due = new Date(clock.now().getTime() - 3_600_000 - 1000).toISOString();
      const mine = db
        .select({ lat: placesTable.lat, lon: placesTable.lon })
        .from(placesTable)
        .where(eq(placesTable.userId, user.id));
      const rows = await db
        .update(weatherReadings)
        .set({ fetchedAt: sql`least(${weatherReadings.fetchedAt}, ${due}::timestamptz)` })
        .where(inArray(sql`(${weatherReadings.lat}, ${weatherReadings.lon})`, mine))
        .returning({ lat: weatherReadings.lat });
      return rows.length;
    },

    /** GET /me/export: place details repeated per widget, never cached readings. */
    async exportFor(user: SessionUser) {
      return (await select(db, user.id)).map(({ w, p }) => ({
        kind: w.kind,
        position: w.position,
        settings: w.settings,
        ...(p && {
          place: {
            name: p.name,
            admin1: p.admin1,
            country: p.country,
            lat: Number(p.lat),
            lon: Number(p.lon),
          },
        }),
      }));
    },
  };
}

export type WidgetsService = ReturnType<typeof createWidgetsService>;
