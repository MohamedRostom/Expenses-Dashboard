# API Contract: Dashboard Widgets

Same conventions as the baseline contract (`specs/001-phased-product-baseline/contracts/api.md`):
session cookie, CSRF header on non-GET, error envelope, foreign ids answer `not_found`. Schemas
live in `packages/contracts/src/widgets.ts` and `packages/contracts/src/places.ts`. Figure
shapes per kind are in `data-model.md` §Derived payload.

## Widgets

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/widgets` | | `{ widgets: [{ id, kind, position, settings, place?, state, asOf, figures }], limit: 8, temperatureUnit }` | Position order; `figures` per kind; `state` per widget |
| GET | `/widgets/types` | | `{ types: [{ kind, name, description, enabled, needsPlace, settingsSchema }] }` | Reflects the `widgets.*` flags; a disabled kind is listed with `enabled: false` only if the user already has one |
| POST | `/widgets` | `{ kind, settings?, placeId?, place?, duplicateOf? }` | 201 `{ widget }` | Appends at the last position; 409 `limit_reached` at eight; 422 `validation_failed` on settings (seventh currency, default currency, unknown code, missing place); enqueues `widgets.rates_backfill` for new currency codes; a `sunrise` widget with neither `placeId` nor `place` takes the lowest-position weather widget's place, else 422 `validation_failed` (`place_required`) |
| PATCH | `/widgets/:id` | `{ settings?, placeId?, place? }` | 200 `{ widget }` | Same validation, applied only to currency codes added in this patch (a stored code that has since become the default is kept); changing the place repoints this widget only and drops the old place row if unreferenced |
| PUT | `/widgets/order` | `{ ids: string[] }` | 200 `{ widgets }` | Must contain exactly the caller's widget ids, each once; otherwise 422; last save wins |
| DELETE | `/widgets/:id` | | 204 | Removes the place if no other widget references it; audit entry |
| POST | `/widgets/refresh` | | 202 `{ queued: number }` | Marks the caller's places due for `widgets.weather_refresh`; one call per user per minute (429 otherwise) |

## Places

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/places/search` | `?q=` (3 to 80 chars) | `{ candidates: [{ name, admin1, country, lat, lon, timeZone }] }` | Up to five; served from `geocode_cache` when fresh; ten calls per user per minute (429 `rate_limited`); empty array when nothing matches; 503 `source_paused` while `widgets.weather_paused_until` is in the future |
| POST | `/places/resolve` | `{ lat, lon }` (device coordinates) | `{ candidates: [...], approximate: boolean }` | Coordinates are rounded on receipt, used once, never stored or logged; `approximate: true` when the result is "near <zone city>" (research R1, Open-Meteo only); audit event `place.device_location_used` without coordinates |

Choosing a candidate happens through `POST /widgets` or `PATCH /widgets/:id` with
`place: { name, admin1, country, lat, lon, timeZone }` in place of `placeId`; the service
creates or reuses the user's `places` row (unique per user on rounded `lat, lon`).

## Operator probe (FR-019)

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/healthz/widgets` | 200 `{ status: 'ok' }` or 503 `{ status: 'degraded' }` | No auth and nothing else in the body (clarify 2026-10-03); 503 while the weather pause is active, or when a source (weather or rates) has failed its last three calls (cleared by the next success); watched by a second uptime monitor, alert within 20 minutes of the third failure (research R13). Counts and cached places go to a daily log summary only |

## Baseline routes extended

- `PATCH /me`: accepts `temperatureUnit: 'C' | 'F'`; `GET /me` returns it.
- `GET /flags`: returns the five `widgets.*` flags.
- `GET /me/export`: gains `widgets` per data-model.md.
- `DELETE /me`: unchanged; the cascade covers `widgets` and `places`.

## Cross-cutting

- Ownership: every `:id` route and `PUT /widgets/order` resolve ids with `user_id = current`.
- States: `state` is `unavailable` when the kind's flag is off; `stale` when `asOf` is older
  than one hour (weather, sunrise) or the rate date is older than the source's latest
  published date (currency); `error` with `cause` in `rate_unavailable | source_unreachable |
  source_limit_reached | place_not_found`; `empty` for spend pace without budgets and fixed
  costs with no fixed categories. "Today" and "this month" are computed in the user's
  `time_zone`. A 401 is the app-wide `session_expired`, never a widget `cause`.
- Attribution: weather and sunrise `figures` include `attribution: "Weather data by
  Open-Meteo.com"` so the client renders it without hard-coding the source.
