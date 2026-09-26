# Data Model: Fix Found Bugs — BUG-001 (Notion connection)

Only what BUG-001 changes. Existing columns are listed for context; see migration `0006_notion.sql` for the full table.

## notion_connections (changed)

| Column | Type | Change | Notes |
|---|---|---|---|
| `id`, `user_id` (unique), `workspace_id`, `workspace_name`, `bot_id` | — | unchanged | one row per user |
| `access_token_enc` | bytea NOT NULL | unchanged | secret-box sealed; emptied on disconnect |
| `refresh_token_enc` | bytea NULL | **new** | secret-box sealed; NULL for connections made before this fix and after disconnect |
| `database_id`, `data_source_id`, `direction`, `cursor` | — | unchanged | cleared (`database_id`, `data_source_id`, `cursor`) when a reconnect lands on a different `workspace_id` |
| `status` | text NOT NULL | **new value** | `connected` \| `error` \| `reconnect_needed` \| `disconnected` |
| `last_sync_at`, `last_error` | — | unchanged | `last_error` holds a short outcome message, never a token |

Migration `0009_*` (Drizzle-generated): `ALTER TABLE notion_connections ADD COLUMN refresh_token_enc bytea;`. `status` is free text today, so the new value needs no DDL; the contract enum (`packages/contracts/src/notion.ts`) is the enforcement point.

### Status transitions

```
(none) ──connect──▶ connected
connected ──transient sync failure──▶ error ──next successful sync──▶ connected
connected|error ──401, renewal refused or no refresh token──▶ reconnect_needed
reconnect_needed ──successful reconnect──▶ connected        (sync skipped while here)
any ──disconnect──▶ disconnected  (tokens cleared, revoke attempted at Notion)
disconnected ──connect──▶ connected
```

Validation rules:
- A renewal writes `access_token_enc` and `refresh_token_enc` together, conditional on the previous `refresh_token_enc` (no lost update).
- `reconnect_needed` and `disconnected` rows are never picked up by `syncNow`/`triggerSyncSoon`.
- Reconnecting to a different `workspace_id` resets `database_id`, `data_source_id` and `cursor` so the user picks a database again (spec edge case).

## Connect attempt (not persisted)

A cookie, not a table.

| Field | Value |
|---|---|
| Name | `__Host-desk_notion_oauth` |
| Value | `<state>.<userId>` — `state` is `crypto.randomUUID()` |
| Attributes | HTTP-only, Secure, SameSite=Lax, Path=/, Max-Age=600 |
| Lifecycle | set by `/notion/start`; deleted by every `/notion/callback` response (single use) |

Valid when: cookie present, `state` equals the returned `state` query parameter, and `userId` equals the signed-in user's id. Anything else → outcome `expired`, nothing stored.

## Callback outcome (not persisted)

`connected | no_pages | denied | expired | failed | unavailable` — carried in the redirect's `notion` query parameter and read once by Connectors; defined as a zod enum in `packages/contracts/src/notion.ts` so API and web share it.
