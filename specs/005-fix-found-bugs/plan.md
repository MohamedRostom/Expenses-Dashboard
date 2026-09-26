# Implementation Plan: Fix Found Bugs — BUG-001 (Notion connection)

**Branch**: to be named when work starts (`phase-N/005-bug-001-notion`, per CLAUDE.md conventions) | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-fix-found-bugs/spec.md`

This spec is a living bug register; this plan covers **BUG-001** only. Each later bug gets its own section appended here (and its own research/data-model/contracts entries), never a rewrite of this one.

## Summary

The Notion connection fails everywhere because no environment has Notion credentials, and an unconfigured feature answers with the SPA's `index.html` (200) instead of an error, which the web client can't parse. The fix has four parts, in delivery order:

1. **Honest failure** (Story 1, FR-001.1–.3): an unconfigured server mounts a small stub that answers `/notion/*` with a JSON `503 feature_unavailable` (and redirects the two browser-navigation routes to Connectors); the SPA fallback serves HTML only to requests that ask for HTML; `apiFetch` turns an unreadable 2xx body into an `ApiError`; Connectors gets a distinct "not available on this server" state.
2. **Configuration** (Story 2, FR-001.4): deploy workflows set `NOTION_CLIENT_ID`/`NOTION_CLIENT_SECRET` on Fly apps when the matching repo secrets exist; `worker.ts` wires Notion from its env like `node.ts` does.
3. **Callback outcomes** (Story 3, FR-001.6–.8, .12): the callback never shows raw JSON — it redirects to `/settings/connectors?notion=<outcome>`; the OAuth state cookie is bound to the user and single use; after a successful exchange the server checks whether any pages were shared.
4. **Renewal and revocation** (Story 4, FR-001.9–.10): store Notion's refresh token encrypted, renew once on a 401 before giving up, add a `reconnect_needed` status that sync skips, revoke at Notion on disconnect.

No new dependency, no new table, one migration (a nullable column plus a status value).

## Technical Context

**Language/Version**: TypeScript, Node 22 LTS (Stage 1) and Cloudflare Workers (Stage 2)

**Primary Dependencies**: existing only — Hono, Drizzle, zod, Vue 3/Pinia; Notion calls use `fetch` through `packages/connectors/src/notion/client.ts`

**Storage**: Postgres 16 (Neon); `notion_connections` gains `refresh_token_enc bytea NULL`; `status` gains the value `reconnect_needed`

**Testing**: Vitest (unit + API with Hono test client and Testcontainers Postgres), recorded Notion fixtures + `FakeNotion`, Playwright e2e-ci against `infra/mocks` Notion routes, e2e-local on staging for the real OAuth round trip

**Target Platform**: Fly.io (`node.ts`) now; Cloudflare Workers (`worker.ts`) must stay green in `worker-build`

**Project Type**: web application (pnpm monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: SC-001.2 — Connect to "Connected to <workspace>" under 1 minute excluding Notion's own screen; the added no-pages check is one Notion search call (page size 1)

**Constraints**: no token or token fragment in any log (FR-001.12); revoke at Notion is best effort with a 5 s timeout and never blocks local disconnect; previews cannot receive Notion's redirect (unregistered URI) and stay in the unavailable state

**Scale/Scope**: one connection per user (existing unique constraint); ~15 files touched across api, web, contracts, db, connectors, mocks, workflows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Check | Result |
|---|---|---|
| I. Test-First | Every change starts from a failing test; FR-001.11 names the first one (unconfigured server returns JSON, not HTML). Quickstart lists the test per story. Coverage on `api` must not drop. | Pass |
| II. One Codebase, Two Runtimes | Stub, error envelope and `notFound` live in `app.ts` (shared); `worker.ts` gets the same Notion wiring as `node.ts`; no new dependency — refresh and revoke are plain `fetch`. `worker-build` must stay green. | Pass |
| III. Money Is Exact | Not touched. | N/A |
| IV. Every User Is an Island | `/notion/*` routes already sit in the ownership matrix; the OAuth state cookie is newly bound to the user id so a callback can't attach one user's Notion to another's session. Matrix rows added for the stub (503 for both users, no leakage). | Pass |
| V. Decide Once, Write It Down | Decisions recorded in spec Clarifications and `research.md`; the new error code is a contracts change regenerated into `openapi.json`. No ADR reopened. | Pass |
| VI. Simplicity and Finished Surfaces | No table for connect attempts (a user-bound cookie does it); one status value instead of a state machine; Connectors gets skeleton/empty/error/unavailable states with copy per error code. No feature flag: this fixes an existing screen's behaviour. | Pass |
| Security baseline | Tokens encrypted with the existing secret box; refresh token rotated on use; secrets only via env/repo secrets; `.env.example` unchanged (vars already listed). | Pass |

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-found-bugs/
├── spec.md              # living bug register
├── plan.md              # this file
├── research.md          # Phase 0 — BUG-001 decisions R1–R10
├── data-model.md        # Phase 1 — notion_connections changes, connect-attempt cookie
├── quickstart.md        # Phase 1 — validation per story
├── contracts/
│   └── notion-api.md    # Phase 1 — /notion/* behaviour, redirect outcomes, error code
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── errors.ts                  # + 'feature_unavailable'
└── notion.ts                  # status enum + 'reconnect_needed'; outcome enum
packages/db/
├── src/schema.ts              # notion_connections.refresh_token_enc
└── migrations/0009_*.sql      # generated
packages/connectors/src/notion/
├── client.ts                  # refreshToken(), revokeToken(), hasSharedContent()
├── fake.ts                    # same, plus scripted refresh/revoke outcomes
└── fixtures/                  # recorded token-refresh, revoke, empty-search responses
apps/api/src/
├── app.ts                     # stub when Notion unconfigured; JSON notFound
├── node.ts                    # SPA fallback only for Accept: text/html
├── worker.ts                  # wire Notion from env
├── routes/notion.ts           # start/callback redirect outcomes; user-bound state
└── services/notion.ts         # store refresh token; renew-once; reconnect_needed; revoke; logging
apps/api/test/
├── notion.test.ts             # extended
├── notion-unavailable.test.ts # new — FR-001.1 first failing test
└── routes-json.test.ts        # new — SC-001.5 every route answers JSON
apps/web/src/
├── api/client.ts              # unreadable 2xx → ApiError
├── views/ConnectorsView.vue   # unavailable / outcome / reconnect states
└── views/MonthView.vue        # small reconnect indicator
infra/mocks/src/notion-fake-routes.ts  # refresh, revoke, denied, empty search
tests/e2e/tests/notion.spec.ts         # ci scenarios per outcome; @local real round trip
.github/workflows/deploy-{staging,fly}.yml  # optional Notion secrets step
```

**Structure Decision**: existing monorepo layout; no new package or app. Changes are confined to the Notion slice plus two cross-cutting fixes (SPA fallback, `apiFetch`) that close the bug class, not just this instance.

## Complexity Tracking

No constitution violations to justify.

## Post-design Constitution Re-check

Re-checked after writing `data-model.md` and `contracts/notion-api.md`: still passing. The one design choice that touched a principle — keeping connect attempts in a cookie rather than a table — is covered under IV (user-bound value) and VI (no new table). The cross-cutting `notFound`/SPA-fallback change affects every route; `routes-json.test.ts` guards it for both runtimes via `createApp`.
