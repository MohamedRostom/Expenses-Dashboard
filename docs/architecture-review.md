# Architectural Review: Expenses Dashboard (Desk)

**Date:** 2026-10-25  
**Reviewer:** AI Code Reviewer  
**Scope:** Overall architecture (not code-level), based on ADRs, repository structure, and key source files

---

## Executive Summary

**Overall Assessment: Strong, well-considered architecture with clear principles.** The project demonstrates thoughtful decision-making around cloud portability, testability, and operational concerns. The dual-runtime (Fly.io + Cloudflare Workers) approach is executed cleanly via Hono's adapter pattern. There are a few architectural risks and areas for improvement that deserve attention.

---

## Strengths

### 1. Cloud Portability via Framework Choice (Not Abstraction Layers)
The decision to use **Hono + Drizzle** as the portable substrate is excellent. Rather than writing custom adapters, you chose frameworks that natively run on both Node and Workers. This avoids the "abstraction leak" problem where hand-written adapters diverge over time.

**Evidence:** `apps/api/src/app.ts` is a single runtime-agnostic factory; `node.ts` and `worker.ts` only differ in adapter instantiation.

### 2. Clean Package Boundaries & Dependency Direction
```
apps/web, apps/api, apps/landing
       ↓
packages/contracts, packages/core, packages/ui, packages/db, packages/connectors
       ↓
(core depends on nothing)
```
This is properly enforced. `packages/core` has zero I/O dependencies — pure domain logic. The workspace dependency graph is acyclic.

### 3. Testing Pyramid with Realistic Trade-offs
- **Unit**: `core` (property-based via fast-check) + `ui`
- **Contract**: Recorded fixtures per connector; fakes validated against same fixtures
- **API**: Testcontainers Postgres, migrations from scratch
- **Worker build**: `wrangler deploy --dry-run` on every PR
- **E2E-CI**: Compose stack, mocked connectors, frozen clock, seeded rates
- **E2E-local**: Real accounts, real browsers, self-hosted runner, never blocks PR

This is a mature, pragmatic testing strategy for a solo developer.

### 4. Feature Flags as First-Class Architecture
The `flags` table + `userFlags` + per-request resolution is well-designed:
- Global defaults + per-user overrides
- Routes gated via `requireFlag` middleware
- CI enables flags for test coverage; production defaults stay off
- Clean separation: "look changes need no flag" (constitution 1.1.1)

### 5. Jobs System Shared Across Stages
`JobRunner` + `registerAllJobs` works identically on Fly (scheduled machine + in-process tick) and Workers (Cron Trigger). The job table is the single source of truth. This avoids duplicating scheduling logic.

### 6. Security Baseline is Comprehensive
- Argon2id, server-side sessions, CSRF double-submit
- Connector tokens encrypted at rest (AES-GCM, `SecretBox` interface with Node/Workers impls)
- Audit log survives account deletion (pseudonymised)
- CSP with nonces, HSTS, rate limiting per IP/account
- Dependabot + CodeQL + secret scanning

### 7. Money Handling is Correct
Integer minor units everywhere, stored rate with date+source, banker's rounding, weekend/holiday fallback recorded. The `core` package isolates this with property-based tests.

---

## Architectural Risks & Concerns

### 1. Worker Bundle Size & Cold Start ⚠️ **HIGH RISK**
**Observation:** The `worker.ts` entry imports the entire app factory + all routes + all services + all connectors at module load time. On Cloudflare Workers, this entire bundle is parsed on every cold start.

**Impact:** 
- Bundle size grows with every route/connector added
- Cold start latency directly affects user-facing latency (no warm pool on free tier)
- The `worker-build` job only validates it *compiles*, not that it's *small*

**Mitigation needed:**
- Implement route-level code splitting (dynamic imports) for Workers entry
- Monitor bundle size in CI (`wrangler deploy --dry-run --outdir` + size check)
- Consider lazy-loading heavy connectors (Gmail, Microsoft Graph) only when routes are mounted

**Reference:** ADR-0001 §Consequences notes "library selection must respect Workers runtime from first commit" but doesn't address bundle size.

---

### 2. Jobs Table as Implicit Coupling Point ⚠️ **MEDIUM RISK**
**Observation:** The `jobs` table is used by:
- `JobRunner` (in-process polling on Fly, Cron on Workers)
- `registerJob` handlers (defined in `app.ts` at startup)
- `enqueue` calls from routes/services
- `ensurePanelsScheduler` / `ensurePanelsPurge` (fire-and-forget at app creation)

**Concerns:**
- No explicit contract for job payloads (just `jsonb`)
- Fire-and-forget scheduler seeding at app creation (`void ensurePanelsScheduler(...).catch(...)`) — if the app restarts during the scheduler's minute window, you get duplicate enqueues (mitigated by `runAfter` but still noisy)
- `cancelForUser` is optional on `JobsDep` (guarded with `?.`) — inconsistency risk
- No visibility into job queue health (no admin UI, no metrics export)

**Recommendation:** Define a `JobPayload` schema per job type in `packages/contracts` or `packages/core`. Add a `jobMetrics` table or structured logging for queue depth/latency.

---

### 3. Session Store Interface Leaks Implementation Details ⚠️ **MEDIUM RISK**
**Observation:** `SessionStore` interface (in `adapters/session-store.ts`) is implemented by:
- `PgSessionStore` (uses `queryDb` bridge over `postgres-js`)
- `KvSessionStore` (uses Cloudflare KV)

**Issue:** The `PgSessionStore` takes a `QueryDb` that exposes `.query(sql, params)` — this is a leaky abstraction. The interface should not require callers to bridge `postgres-js`. Similarly, `KvSessionStore` requires `KVNamespace` directly.

**Impact:** Harder to swap implementations; test fakes must mimic the bridge shape.

**Recommendation:** Make `SessionStore` fully self-contained — accept connection string / binding in constructor, manage its own client internally.

---

### 4. Rate Limiter Adapter Coupled to Postgres Bridge ⚠️ **MEDIUM RISK**
**Observation:** `PgRateLimiter` also takes the `QueryDb` bridge. Same issue as sessions. On Workers, it still uses Postgres (via Hyperdrive) rather than a native KV-based limiter.

**Impact:** Rate limiting adds Hyperdrive round-trip latency on Workers. For a global edge runtime, a KV-backed limiter would be more performant.

**Recommendation:** Implement `KvRateLimiter` for Stage 2; keep `PgRateLimiter` for Stage 1. Both implement a common `RateLimiter` interface.

---

### 5. No Explicit API Versioning Strategy ⚠️ **MEDIUM RISK**
**Observation:** Routes are mounted at `/` with no version prefix. `packages/contracts` generates `openapi.json` but there's no versioning policy documented.

**Risk:** Breaking changes to request/response shapes will break web clients. The web app and API are deployed together in Stage 1 (same container), so lockstep deploy works. But in Stage 2, the Worker and Pages deploy independently — a version skew window exists.

**Recommendation:** Adopt URL versioning (`/v1/...`) or header-based versioning before Stage 2 cut-over. Document the policy in an ADR.

---

### 6. Database Migrations: No Rollback Strategy Documented ⚠️ **MEDIUM RISK**
**Observation:** Migrations are plain SQL files applied on API start (`runMigrations` in `node.ts`). ADR-0001 says "Never edit an applied migration; add a new one." But there's no documented rollback procedure for a bad migration in production.

**Risk:** A faulty migration on Stage 2 (Neon via Hyperdrive) could require manual intervention during the cut-over parallel run week.

**Recommendation:** Document rollback procedure in `docs/runbooks/restore.md`. Consider adding `down` migrations or a `migrate:down` script for the last N migrations.

---

### 7. Web App: Single-Page App with No SSR for Auth Pages ⚠️ **LOW-MEDIUM RISK**
**Observation:** `apps/web` is a pure SPA. Auth pages (`/login`, `/register`, etc.) are client-rendered. The API serves `index.html` with CSP nonce substitution on SPA fallback.

**Concerns:**
- SEO irrelevant for auth pages, but social sharing / link previews show blank content
- First meaningful paint delayed by JS bundle download + execution
- CSP nonce requires server round-trip on every navigation (handled by SPA fallback)

**Mitigation:** Consider `vite-ssg` for auth pages only (like the landing page), or at least add meta tags in `index.html` for link previews.

---

### 8. Connector Pattern: Fake + Recorded Fixtures — Good, But Drift Risk ⚠️ **LOW RISK**
**Observation:** Each connector has: real client + fake + recorded fixtures. Fakes are validated against fixtures in contract tests.

**Gap:** No automated check that recorded fixtures are "fresh" (not stale from API changes). The `worker-build` job doesn't validate fixtures.

**Recommendation:** Add a scheduled job (monthly?) that re-records fixtures against live APIs in a test environment and fails if diffs exceed a threshold. Or at minimum, document the fixture refresh process.

---

### 9. Environment Configuration: Two Separate Parsers ⚠️ **LOW RISK**
**Observation:** `apps/api/src/env.ts` exports both `parseEnv` (Node, validates `process.env`) and `parseWorkersBindings` (Workers, validates `env` bindings). They share validation logic but are separate code paths.

**Risk:** Drift between the two parsers. A variable added to one but not the other causes runtime failures in one stage.

**Recommendation:** Unify into a single schema definition (Zod) that both parsers reference. Generate `.env.example` from the schema.

---

### 10. Observability: Structured Logs Only, No Metrics/Tracing ⚠️ **LOW RISK (for now)**
**Observation:** `logger` adapter outputs JSON. Sentry DSN is wired but commented as "once Sentry is wired in." No OpenTelemetry, no custom metrics export.

**Risk:** As the beta grows (Phase 5), debugging production issues without metrics/tracing will be painful.

**Recommendation:** Before Phase 5 public beta, add:
- OpenTelemetry SDK (works on Workers via `@opentelemetry/sdk-node` + custom exporter)
- Key metrics: request latency (p50/p95/p99), error rate, job queue depth, active users
- Structured logging correlation IDs across request + job execution

---

## Architecture Decision Records (ADRs) — Review

| ADR | Status | Assessment |
|-----|--------|------------|
| ADR-0001 Platform | Proposed | **Solid foundation.** Amended by 003, 004. Should be "Accepted" now that M0-M4 are built. |
| ADR-0002 Naming | Proposed | **Blocked on 4/5 items.** Product name, licence, analytics still pending. Resend decided. Neon decided. |
| ADR-0003 No Bank | Accepted | **Good scope control.** Simplified v1 correctly. |
| ADR-0004 Mail/Calendar | Accepted | **Well-scoped.** CASA gate on Google mail is pragmatic. Provider flags allow incremental ship. |
| ADR-0005 Weather | Accepted | **Excellent.** Non-commercial tier constraint clearly documented with revisit trigger. |
| ADR-0006 Visual | Superseded | Historical. |
| ADR-0007 Premium | Accepted | **Bold but controlled.** CSS-only motion, contrast-tested, feature-flagged. Good. |

---

## Recommendations Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Worker bundle size monitoring + code splitting | Medium | Prevents Stage 2 deploy failures / cold start regression |
| **P0** | API versioning strategy (ADR) | Low | Prevents breaking changes during Stage 2 independent deploys |
| **P1** | SessionStore / RateLimiter interface cleanup | Medium | Reduces coupling, improves testability |
| **P1** | Job payload schemas + queue observability | Medium | Operational visibility for beta |
| **P1** | Migration rollback runbook | Low | Risk mitigation for cut-over |
| **P2** | Unified env schema (Zod) | Low | Prevents config drift between stages |
| **P2** | Fixture freshness check (scheduled) | Low | Prevents silent connector breakage |
| **P2** | OpenTelemetry + metrics before public beta | Medium | Operational maturity |
| **P3** | KV-backed RateLimiter for Workers | Medium | Performance on edge |
| **P3** | SSR for auth pages (optional) | Low | UX polish |

---

## Specific Code-Level Observations

### `apps/api/src/app.ts` — Lines 362-368 (Fire-and-Forget Scheduler)
```typescript
void ensurePanelsScheduler(deps.db, deps.jobs.enqueue.bind(deps.jobs), deps.clock.now()).catch(
  (err) => console.error('panels.scheduler: could not enqueue', err),
);
```
**Issue:** If the app restarts during the minute when the scheduler runs, you get duplicate enqueues. The job handler should be idempotent (it likely is via `runAfter`), but the noise in logs/jobs table is avoidable. Consider a "singleton lock" pattern or accept the noise (documented).

### `apps/api/src/worker.ts` — Lines 81-102 (App Caching)
```typescript
let app: ReturnType<typeof createApp> | undefined;

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    if (!app) { /* build deps, register jobs, create app */ }
    return app.fetch(request);
  },
  async scheduled(...) { /* rebuilds deps, registers jobs, runs jobs */ }
}
```
**Issue:** The `scheduled` handler rebuilds the entire dependency graph on every cron tick. This is correct for Workers (isolates are ephemeral) but means job registration runs on every tick. Since `registerJob` is a Map replace, it's idempotent — but it's worth documenting why this is intentional.

### `packages/db/src/schema.ts` — Line 276 (Client-Generated UUID)
```typescript
id: uuid('id').primaryKey(), // no defaultRandom
```
**Good:** Client-generated UUID v7 prevents duplicate inserts on retry. The comment explains the intent. This is a strong pattern for idempotent expense creation.

### `apps/api/src/middleware/session.ts` — CSRF Double-Submit
The CSRF implementation uses `__Host-` prefix cookie + double-submit header. This is correct and Workers-compatible (no `SameSite` issues with `__Host-`).

---

## Conclusion

The architecture is **production-ready for Stage 1 (Fly.io beta)** with the current design. The dual-runtime strategy is sound, the testing pyramid is comprehensive, and the domain modeling (money, sync, jobs) is rigorous.

**Before Stage 2 cut-over, address P0 items:**
1. Worker bundle size monitoring + code splitting
2. API versioning strategy (ADR)
3. SessionStore/RateLimiter interface cleanup

These are not blockers for the current phase but will prevent painful regressions during the Cloudflare migration.

The project demonstrates a rare level of architectural discipline for a solo-developed product — the ADR trail, the testing strategy, the connector pattern, and the two-stage deployment design are all well-executed.