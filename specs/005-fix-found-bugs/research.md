# Research: Fix Found Bugs — BUG-001 (Notion connection)

Phase 0 decisions for BUG-001. Each later bug appends its own section. Code facts below were read from the repository on 2026-09-26; Notion facts from its OAuth documentation the same day.

## Findings that shaped the design

- `apps/api/src/app.ts:171` mounts `/notion/*` only when `deps.notion` is set; `node.ts:117-121` then serves `index.html` (200) for every unmatched request, including API calls. Confirmed live: `GET /notion/connection` → `200 text/html` on both Fly apps.
- `apps/api/src/worker.ts:55-58` hard-codes `notion: undefined` ("Not wired until a later task adds Cloudflare secrets").
- `services/notion.ts:505-512` sets `status: 'error'` for **every** sync failure, including `NotionAuthError` (401), and `syncNow` (line 316) only skips `disconnected` — so a revoked token retries forever.
- `exchangeCode` returns only `access_token`, `workspace_*`, `bot_id`; Notion's response also carries a `refresh_token`, which is discarded.
- `routes/notion.ts:59-73` throws `ApiError` from the callback, which the browser renders as raw JSON because the callback is a full-page navigation. `requireAuth` on `/notion/start` likewise returns JSON to a navigation.
- The OAuth state cookie `desk_notion_oauth_state` (600 s, HTTP-only, deleted on callback) is not tied to the user who started the flow.
- `ErrorCode` (`packages/contracts/src/errors.ts`) has no code for "feature not configured".

## R1 — What an unconfigured server answers

**Decision**: When `deps.notion` is undefined, `createApp` mounts a stub on `/notion/*`: JSON routes return `503` with `{ error: { code: 'feature_unavailable', message: 'Notion sync is not available on this server' } }`; `/notion/start` and `/notion/callback` redirect (302) to `/settings/connectors?notion=unavailable`. New `ErrorCode` value `feature_unavailable`.

**Rationale**: 503 says "this server can't do it right now", which is true and distinct from `404 not_found` (which Connectors already reads as "no connection yet" and would wrongly enable Connect). A generic code, not `notion_unavailable`, so Google/Microsoft connectors in spec 002 reuse it.

**Alternatives**: 404 (collides with "not connected"); hiding the Notion card entirely (users on a misconfigured server would never learn why); a `GET /features` endpoint the UI checks first (an extra round trip and a second source of truth).

## R2 — Closing the HTML-instead-of-data bug class

**Decision**: `node.ts`'s SPA fallback serves `index.html` only to `GET`/`HEAD` requests whose `Accept` header includes `text/html`; anything else calls `c.notFound()`. `createApp` sets `app.notFound` to return the JSON envelope `404 not_found`, so both runtimes answer unknown API paths with JSON.

**Rationale**: browsers send `Accept: text/html` on navigations; `fetch` from `apiFetch` sends `*/*` or JSON. This fixes the whole class (SC-001.5), not just Notion.

**Alternatives**: prefixing every API route with `/api` (large, breaking change across web, mocks, docs and the Worker route); an allowlist of SPA paths (drifts from `router.ts`).

## R3 — Client-side guard

**Decision**: `apiFetch` catches a JSON parse failure on a 2xx body and throws `ApiError('internal', 'Unexpected response from the server', res.status)`.

**Rationale**: FR-001.3 — any future misroute surfaces as a coded, readable error, and views branch on `code` (project rule: error copy branches on error code).

## R4 — Callback and start never show raw JSON

**Decision**: `/notion/start` redirects an unauthenticated visitor to `/login?next=/settings/connectors`. `/notion/callback` always ends in a redirect to `/settings/connectors?notion=<outcome>` with outcome ∈ `connected | no_pages | denied | expired | failed | unavailable`. Mapping: `error=access_denied` → `denied`; missing/mismatched/foreign-user state → `expired`; token exchange error or Notion unreachable → `failed`; success with nothing shared → `no_pages`. Nothing is stored for `denied`, `expired`, `failed`.

**Rationale**: Story 3 and SC-001.3 (5 of 5 outcomes land on Connectors with specific copy). Query-param outcomes keep the callback stateless and testable with the Hono client.

## R5 — Connect attempt: single use, 10 minutes, bound to the user

**Decision**: keep the cookie, rename it `__Host-desk_notion_oauth` (forces `Secure`, `Path=/`, no `Domain` — can't be planted by a subdomain), value `<random state>.<user id>`, `maxAge` 600 s, deleted on every callback. The callback requires the cookie's user id to equal the current session's user id.

**Rationale**: FR-001.6 and the "signed out / other account in between" edge case, with no new table (Principle VI). Replay fails because the cookie is gone after first use.

**Alternatives**: a `notion_oauth_attempts` table (durable but unnecessary for a 10-minute, single-browser flow); signing the cookie with HMAC (the `__Host-` prefix plus HTTP-only already prevents tampering by other origins).

## R6 — Detecting "no pages shared"

**Decision**: after a successful exchange, one Notion `search` call with `page_size: 1`; zero results → store the connection but redirect with `no_pages`; Connectors explains and offers "Reconnect to choose pages" (which runs `/notion/start` again — Notion's consent screen lets the user edit the selection).

**Rationale**: search only returns objects shared with the integration, so an empty result is exactly "nothing shared". One cheap call.

## R7 — Token renewal

**Decision**: store `refresh_token` encrypted in a new nullable column `refresh_token_enc`. On `NotionAuthError` during sync or any user-initiated Notion call: if a refresh token exists, `POST /v1/oauth/token` with `grant_type: refresh_token` (Basic auth, as for the code exchange), store the new access **and** refresh token (rotation), retry the original call once. If renewal fails or no refresh token exists (connections made before this fix), set `status = 'reconnect_needed'`. The update is conditional on the old encrypted refresh value so two concurrent renewals can't overwrite a newer token with an older one.

**Rationale**: spec Clarification Q1; renewal is invisible to the user (Story 4 scenario 1).

## R8 — Revoke on disconnect

**Decision**: `DELETE /notion/connection` calls Notion's revoke-token endpoint (Basic auth, body `{ token }`) with a 5 s timeout, logs the outcome, and then clears the local tokens regardless.

**Rationale**: spec Clarification Q2; best effort so a Notion outage never traps a user in a connection they want gone.

## R9 — Status model

**Decision**: `NotionConnectionStatus` becomes `connected | error | reconnect_needed | disconnected`. `error` stays for transient failures (rate limits, 5xx) and is retried by the next sync; `reconnect_needed` is terminal until a successful reconnect, is skipped by `syncNow` and `triggerSyncSoon`, and drives the Connectors "Reconnect Notion" state and a small indicator on the month view (which reads `GET /notion/connection`, ignoring 404/503).

**Rationale**: separates "try again later" from "only the user can fix this" with one extra enum value.

## R10 — Logging

**Decision**: one structured line per failed exchange, renewal, revoke or refused access: `{ event: 'notion.oauth' | 'notion.sync', outcome, userId, notionError }` where `notionError` is Notion's `error`/`code` string. Tokens, codes and the state value are never logged; a unit test asserts the logged payload contains no substring of the fake tokens.

**Rationale**: FR-001.12; enough to diagnose a repeat of BUG-001 from Fly logs.

## R11 — Configuration and environments

**Decision**: `deploy-staging.yml` and `deploy-fly.yml` get a step that runs `flyctl secrets set --stage NOTION_CLIENT_ID=… NOTION_CLIENT_SECRET=…` only when `STAGING_NOTION_CLIENT_ID` (resp. `PRODUCTION_…`) is set, mirroring the Resend step; both values are required together (`env.ts:36` already rejects one without the other). `worker.ts` builds `notion` from `env.NOTION_CLIENT_ID`/`SECRET` when both are present. Previews set nothing and show the unavailable state; e2e-ci keeps using `infra/mocks` via `NOTION_API_BASE`.

**Owner tasks** (outside code): create the Notion public integration with redirect URIs `https://ros-desk-staging.fly.dev/notion/callback` and `https://ros-desk-production.fly.dev/notion/callback`, then add the four repo secrets.
