# Contract: Notion routes after BUG-001

Changes to the HTTP contract only; request/response shapes not mentioned are unchanged (see `packages/contracts/src/notion.ts` and the generated `packages/contracts/openapi.json`, which must be regenerated in the same PR).

## Error envelope

New `ErrorCode` value: `feature_unavailable` (HTTP 503). Generic — reused by any optional connector whose credentials aren't configured.

```json
{ "error": { "code": "feature_unavailable", "message": "Notion sync is not available on this server" } }
```

## Unknown paths (all runtimes)

| Request | Before | After |
|---|---|---|
| any unmatched path, `Accept` without `text/html` | `200 text/html` (index.html) on Node | `404` JSON `not_found` |
| `GET`/`HEAD` unmatched path, `Accept: text/html` | index.html | index.html (unchanged — SPA client routes) |

## When Notion is not configured

| Route | Response |
|---|---|
| `GET /notion/connection`, `PUT /notion/connection`, `DELETE /notion/connection`, `GET /notion/databases`, `POST /notion/databases`, `POST /notion/sync` | `503 feature_unavailable` (after auth: unauthenticated callers still get `401 unauthenticated`) |
| `GET /notion/start`, `GET /notion/callback` | `302` → `/settings/connectors?notion=unavailable` |

## When Notion is configured

### `GET /notion/start` (browser navigation)

| Condition | Response |
|---|---|
| not signed in | `302` → `/login?next=/settings/connectors` |
| signed in | sets `__Host-desk_notion_oauth`; `302` → Notion authorize URL (`owner=user`, `state`, `redirect_uri=<APP_ORIGIN>/notion/callback`) |

### `GET /notion/callback` (browser navigation)

Always deletes the attempt cookie and answers `302` → `/settings/connectors?notion=<outcome>`. Never a JSON body.

| Condition (first match wins) | Outcome | Stored |
|---|---|---|
| query has `error=access_denied` (user cancelled) | `denied` | nothing |
| query has any other `error` | `failed` | nothing |
| not signed in, cookie missing, state mismatch, or cookie user ≠ session user | `expired` | nothing |
| token exchange fails or Notion unreachable | `failed` | nothing |
| exchange succeeds, search finds nothing shared | `no_pages` | connection (status `connected`) |
| exchange succeeds, something shared | `connected` | connection (status `connected`) |

### `GET /notion/connection`

Unchanged shape; `status` may now be `reconnect_needed`.

### `DELETE /notion/connection`

Unchanged response (`204`). Now also calls Notion's revoke-token endpoint first (best effort, 5 s timeout); the local tokens are cleared whether or not that call succeeds.

### `POST /notion/sync` and background sync

On a Notion 401: renew once using the stored refresh token and retry; if renewal is refused or no refresh token exists, the connection becomes `reconnect_needed` and the response reports `status: "reconnect_needed"`. Connections in `reconnect_needed` or `disconnected` are not synced.

## Web client (`apps/web`)

| Input | Connectors shows |
|---|---|
| `503 feature_unavailable` | "Notion sync isn't available on this server yet." — Connect disabled, no toast |
| `404 not_found` | not-connected state, Connect enabled |
| `?notion=connected` | "Connected to <workspace>" (plus database picker) |
| `?notion=no_pages` | "No pages were shared with Desk" + "Reconnect to choose pages" |
| `?notion=denied` | neutral "Notion wasn't connected" + "Try again" |
| `?notion=expired` | "That connection attempt expired — try again" |
| `?notion=failed` | "Couldn't connect to Notion — try again" |
| `?notion=unavailable` | same as `503 feature_unavailable` |
| connection `status: reconnect_needed` | "Reconnect Notion" state; month view shows a small reconnect indicator |

The page removes the `notion` query parameter after reading it, so a refresh doesn't replay the message.
