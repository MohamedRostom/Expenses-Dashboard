# API Contract: Mail and Calendar Panels

Same conventions as the baseline contract (`specs/001-phased-product-baseline/contracts/api.md`):
session cookie, CSRF header on non-GET, error envelope, foreign ids answer `not_found`. Schemas
live in `packages/contracts/src/today.ts` and `packages/contracts/src/connections.ts`.

## Today page

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/today` | | `{ days: [{ date, events: [{ id, accountId, title, startsAt, endsAt, allDay, location, tentative, link }] }], messages: [{ id, accountId, fromName, fromAddress, subject, preview, receivedAt, unread, link }], accounts: [{ id, provider, label, colour, capabilities, status, lastRefreshAt, stale, unreadCount, reconnectUrl? }], generatedAt }` | Seven days from today in the user's time zone; messages newest first, at most fifty per account; empty arrays when nothing is connected |
| POST | `/today/refresh` | | 202 `{ queued: [accountId] }` | Marks every unpaused account whose last refresh is older than two minutes as due now; rate limited to one call per user per minute (429 otherwise) |

## Connections

| Method | Path | Body / Query | Response | Notes |
|--------|------|--------------|----------|-------|
| GET | `/connections` | | `{ accounts: [{ id, provider, address, label, colour, capabilities, grantedScopes, status, pausedAt, lastRefreshAt, lastError, calendars: [{ id, name, isPrimary, enabled }] }], limit: 10 }` | |
| GET | `/connections/providers` | | `{ providers: [{ id: 'google' or 'microsoft' or 'standards', capabilities: [...], enabled: boolean, presets?: [{ name, imapHost, imapPort, caldavUrl }] }] }` | Reflects the per-provider feature flags; `google` lists `mail` only when `panels.google_mail` is on |
| GET | `/connections/:provider/start` | `?capabilities=mail,calendar` | 302 to the provider consent screen | PKCE and state cookie as for sign-in; scopes per research R6; refused (409 `limit_reached`) at ten accounts |
| GET | `/connections/:provider/callback` | `?code&state` | 302 to `/settings/connections?connected=<id>` | Creates or merges the account row, seals the refresh token, enqueues an immediate refresh |
| POST | `/connections/standards` | `{ address, password, imapHost?, imapPort?, caldavUrl?, capabilities }` | 201 `{ account }` | Verifies login and inbox (IMAP) and discovery (CalDAV) before saving; 422 `verification_failed` with `{ step }` on failure; password sealed, never returned |
| PATCH | `/connections/:id` | `{ label?, colour?, paused?, calendars?: [{ id, enabled }] }` | 200 `{ account }` | Pausing sets `paused_at` and stops scheduling; enabling a calendar triggers a refresh |
| GET | `/connections/:id/calendars` | | `{ calendars: [{ id, name, isPrimary, enabled }] }` | Re-lists from the provider and upserts `account_calendars` |
| POST | `/connections/:id/reconnect` | | 302 to the provider consent screen, or 200 `{ needsPassword: true }` for standards | Keeps the row and cache; replaces the credential on callback |
| POST | `/connections/:id/refresh` | | 202 `{}` | Marks that account due now; same rate limit as `/today/refresh` |
| DELETE | `/connections/:id` | | 204 | Revokes at the provider, then deletes the row and its cache; a revoke failure is audited and the delete still proceeds |

## Baseline routes extended

- `DELETE /me`: before the user cascade, revokes every connected account at its provider (best
  effort, audited).
- `GET /flags`: returns the four `panels.*` flags so the web app can hide providers.
- `GET /me/export`: gains `connections: [{ provider, address, label, capabilities, status }]`
  without credentials or cached items.

## Cross-cutting

- Ownership: every `:id` route is looked up with `user_id = current`.
- Idempotency: `POST /connections/standards` with an existing `(provider, address)` merges
  capabilities and replaces the credential rather than creating a second row.
- Redirect targets after OAuth are fixed to `/settings/connections`; the `state` cookie carries
  the requested capabilities and whether this is a reconnect.
