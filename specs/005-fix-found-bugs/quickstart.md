# Quickstart: validating BUG-001 (Notion connection)

How to prove each story works. Tests are written first and must fail against today's code (Principle I); the first one to write is Story 1's API test.

## Prerequisites

- `pnpm install`; Node 22. API tests use Testcontainers, which needs Docker — run them in CI if it isn't available locally.
- e2e-ci stack: `infra/docker-compose.yml` with `NOTION_API_BASE=http://mocks:4000/notion` and fake `NOTION_CLIENT_ID`/`SECRET`.
- Real round trip only: the Notion public integration exists and `STAGING_NOTION_CLIENT_ID`/`STAGING_NOTION_CLIENT_SECRET` repo secrets are set (owner task, research R11).

## Story 1 — honest unavailable state

| Check | Command | Expected |
|---|---|---|
| API returns JSON, not HTML, when unconfigured | `pnpm --filter @desk/api test notion-unavailable` | `GET /notion/connection` (signed in) → `503`, `content-type: application/json`, code `feature_unavailable`; `/notion/start` → `302 …?notion=unavailable` |
| No route answers HTML to an API request | `pnpm --filter @desk/api test routes-json` | every registered route, called with `Accept: application/json`, returns a JSON content type (SC-001.5) |
| Client guard | `pnpm --filter @desk/web test client` | a 2xx HTML body rejects with `ApiError` code `internal` |
| UI | `pnpm --filter @desk/e2e exec playwright test notion.spec.ts --project=ci -g unavailable` (stack started without Notion credentials) | Connectors shows the unavailable copy, Connect disabled, no toast (SC-001.1) |
| Live, before configuring Notion | `curl -s -o /dev/null -w "%{http_code} %{content_type}" https://ros-desk-staging.fly.dev/notion/connection` | `401 application/json` (was `200 text/html`) |

## Story 2 — connect end to end

| Check | Command | Expected |
|---|---|---|
| Mocked flow | `playwright test notion.spec.ts --project=ci -g connect` | Connect → mock consent → Connectors shows the workspace name; Disconnect → not-connected |
| Not signed in | API test: `GET /notion/start` without session | `302 /login?next=/settings/connectors` |
| Worker parity | `pnpm worker:build` | green; Notion wired from env in `worker.ts` |
| Real round trip (staging) | `playwright test notion.spec.ts --project=local` on `desk-local` | connect with a real Notion account in under 1 minute excluding Notion's screen (SC-001.2) |

## Story 3 — every outcome lands on Connectors

API tests (Hono client + `FakeNotion`), one per row of the callback table in [contracts/notion-api.md](./contracts/notion-api.md): `denied`, `failed` (exchange error and Notion down), `expired` (no cookie, wrong state, other user's cookie, replayed link), `no_pages`, `connected`. Each asserts the redirect target and whether a row was stored. e2e-ci covers `denied`, `expired` and `no_pages` visually (SC-001.3: 5 of 5 outcomes, no raw JSON).

## Story 4 — renewal, reconnect, revoke

| Check | Expected |
|---|---|
| Expired access, valid refresh token (`FakeNotion.failNextWith('unauthorized')` then refresh succeeds) | sync succeeds, both tokens rotated, status stays `connected` |
| Refresh refused | status `reconnect_needed`; a second sync makes no Notion call (SC-001.4) |
| Legacy row without refresh token + 401 | straight to `reconnect_needed` |
| Reconnect from `reconnect_needed` | status `connected`, sync resumes |
| Disconnect with Notion revoke failing/timing out | `204`, local tokens cleared, failure logged |
| Logging | logged payloads contain no substring of the fake access/refresh tokens (FR-001.12) |
| Ownership matrix | `/notion/*` rows for user A/B, including the unavailable stub, show no cross-user access |

## Done for BUG-001

All of the above green in CI; `openapi.json` regenerated; CHANGELOG line; Bug Register row set to `Fixed in vX.Y.Z` once the tag carrying it passes the staging smoke; SC-001.2 recorded from the first real staging connect.
