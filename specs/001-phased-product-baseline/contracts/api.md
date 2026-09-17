# API Contract: Phased Product Baseline

JSON over HTTPS, same origin as the web app. Authenticated routes require the session cookie;
every non-GET route also requires the `X-CSRF-Token` header matching the `desk_csrf` cookie.
Request and response shapes are zod schemas in `packages/contracts` (one file per route group),
from which OpenAPI is generated; this document lists the surface and semantics per phase.

Errors: `{ error: { code: string, message: string, details?: object } }` with codes such as
`validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `rate_limited`, `conflict`,
`rate_unavailable`. Foreign-owned resources always answer `not_found`, never `forbidden`.

## Phase 0

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/healthz` | `{ status: 'ok', version, sha }` (exists) |

## Phase 1: accounts and settings

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| POST | `/auth/register` | `{ email, password, defaultCurrency, timeZone }` | 202 `{}` | Always 202 (no account enumeration); sends verify mail; rate limited per IP and email |
| POST | `/auth/verify` | `{ token }` | 200 `{ user }` + session cookie | Single use, 24 h |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + session cookie | Rotates session; 401 `invalid_credentials`; rate limited |
| POST | `/auth/logout` | | 204 | Revokes current session |
| GET | `/auth/google/start` | | 302 to Google | PKCE + state in a short-lived cookie |
| GET | `/auth/google/callback` | `?code&state` | 302 to `/` | Links or creates user; verified email only |
| POST | `/auth/password/forgot` | `{ email }` | 202 `{}` | Always 202; reset mail, 20 min token |
| POST | `/auth/password/reset` | `{ token, password }` | 204 | Single use; revokes all other sessions |
| GET | `/me` | | `{ user: { id, email, defaultCurrency, theme, timeZone, onboardingCompletedAt, createdAt } }` | |
| PATCH | `/me` | `{ theme?, defaultCurrency?, timeZone?, onboardingCompletedAt? }` | 200 `{ user, job? }` | Currency change enqueues `currency.change`, returns job id |
| POST | `/me/email` | `{ newEmail, password? }` | 202 `{}` | Sends a confirmation link to the new address and a notice to the old; rate limited |
| POST | `/me/email/confirm` | `{ token }` | 200 `{ user }` | Single use, 24 h; updates email, revokes other sessions |
| DELETE | `/me/password` | | 204 | Allowed only while a Google link exists; otherwise 409 `conflict` |
| DELETE | `/me/oauth/:provider` | | 204 | Allowed only while a password exists; otherwise 409 `conflict` |
| GET | `/me/sessions` | | `{ sessions: [{ id, current, lastSeenAt, userAgent }] }` | |
| DELETE | `/me/sessions/:id` | | 204 | |
| GET | `/me/export` | | `application/json` stream | Full export document (see below) |
| DELETE | `/me` | `{ password? }` | 204 | Cascading wipe; audit entry; Google-only accounts confirm via re-auth |
| GET | `/currencies` | | `{ currencies: [{ code, name, exponent }] }` | From core's ISO 4217 table |
| GET | `/jobs/:id` | | `{ id, name, status, progressDone, progressTotal, error }` | Owner only |
| GET | `/flags` | | `{ flags: { [key]: boolean } }` | Resolved for the current user |

Export document: `{ exportedAt, user, categories[], expenses[] (all fields incl. conversion and
deletedAt), importBatches[], notion: { connected, direction, databaseId }, version: 1 }`.

## Phase 2: expenses, categories, import

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/expenses` | `?month=YYYY-MM` or `?from&to`, `?category`, `?includeDeleted` | `{ expenses[], summary }` | Paginated by cursor at 500 rows |
| POST | `/expenses` | `{ id?, description, amount: { minor, currency }, date, categoryId, paidWith, kind, notes? }` | 201 `{ expense }` or 200 if `id` already exists | Insert-if-absent on client UUID v7 |
| PATCH | `/expenses/:id` | partial fields; `rateOverride?: { rate } or null` | 200 `{ expense }` | Changing date or currency re-fetches the rate unless overridden |
| DELETE | `/expenses/:id` | | 204 | Soft delete (bin) |
| POST | `/expenses/:id/restore` | | 200 `{ expense }` | Within 30 days |
| GET | `/summary/month` | `?month` | `{ month, currency, spent, budgeted, remaining, byCategory: [{ categoryId, spent, budget, overBudget }], pendingRates }` | Powers the three tiles and bars |
| GET | `/summary/year` | `?year` | `{ year, currency, months: [{ month, spent, budgeted }] }` | |
| GET | `/categories` | | `{ categories[] }` | |
| POST | `/categories` | `{ name, colour, defaultKind?, budgetMinor? }` | 201 | |
| PATCH | `/categories/:id` | partial | 200 | |
| DELETE | `/categories/:id` | | 204 | Reassigns expenses to "Other" first; "Other" is not deletable |
| GET | `/imports/profiles` | | `{ profiles[] }` | |
| PUT | `/imports/profiles/:name` | `{ mapping }` | 200 | |
| POST | `/imports` | multipart `file`, `profile` | 201 `{ batch: { id, rows: [{ rowNumber, parsed, status, error }] } }` | Preview only; nothing created |
| POST | `/imports/:id/commit` | `{ skipRows?: number[], fixes?: { [rowNumber]: parsedPatch } }` | 200 `{ batch }` | Creates expenses for `ok` rows |
| POST | `/imports/:id/undo` | | 200 `{ batch }` | Bins expenses created by the batch |
| GET | `/rates` | `?date&from&to` | `{ rate, rateDate, source }` | Used by the form to preview a conversion |

## Phase 3: Notion and capture

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/notion/start` | | 302 to Notion consent | Public OAuth |
| GET | `/notion/callback` | `?code&state` | 302 to `/settings/connectors` | Stores encrypted token |
| GET | `/notion/connection` | | `{ connection: { status, direction, workspaceName, databaseId, lastSyncAt, lastError } or null }` | |
| GET | `/notion/databases` | | `{ databases: [{ id, title, compatible }] }` | Candidate tables in the workspace |
| PUT | `/notion/connection` | `{ databaseId? or createDatabase: { parentPageId }, direction }` | 200 | Creates the known layout when asked |
| POST | `/notion/sync` | | 202 `{ job }` | Sync now |
| DELETE | `/notion/connection` | | 204 | Disconnect, data kept both sides |
| GET | `/expenses/:id/versions` | | `{ versions[] }` | Change history |
| GET | `/capture/tokens` | | `{ tokens: [{ label, url, createdAt, lastUsedAt }] }` | URL includes the secret once at creation/rotation only |
| POST | `/capture/tokens/:label/rotate` | | 201 `{ url }` | Old token revoked immediately |
| GET/PUT | `/capture/mapping` | `{ mapping: { [label]: categoryId } }` | 200 | |
| POST | `/hooks/generic/:token` | see `generic-webhook.md` | 201 / 200 | Unauthenticated; token is the credential |

## Phase 4: insight and onboarding

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/summary/category/:id` | `?months=12` | `{ categoryId, months: [{ month, spent, budget }] }` |
| GET | `/summary/forecast` | `?month` | `{ month, spentToDate, committedFixed, forecast, basis }` |
| GET | `/summary/compare` | `?a=YYYY-MM&b=YYYY-MM` | `{ a, b, byCategory: [{ categoryId, a, b, delta }] }` |

## Phase 5: operations

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| POST | `/feedback` | `{ page, message, contactOk }` | 202 (rate limited per user) |
| GET | `/healthz` | | adds `{ db: 'ok' or 'degraded' }` for the uptime monitor |

## Cross-cutting

- Pagination: `?cursor` and `nextCursor` in responses that can exceed 500 rows.
- Idempotency: `POST /expenses` by client id; `POST /hooks/generic/:token` by receipt key.
- Ownership: every `:id` is looked up with `user_id = current`; foreign ids yield `not_found`.
- Versioning: no path prefix in v1; breaking changes bump `version` in the export document and
  are recorded in `CHANGELOG.md`.
