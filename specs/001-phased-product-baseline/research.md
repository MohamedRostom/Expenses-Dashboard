# Research: Phased Product Baseline

Date: 2026-09-16. Every technical unknown from the plan's Technical Context is resolved below.
Items that are the owner's product decisions (ADR-0002) are listed last with the default the
plan assumes; they are not blockers for planning but must be accepted before the phase that
needs them.

## R1. Password hashing that runs on Node and Workers

- **Decision**: Argon2id via `hash-wasm` behind a `PasswordHasher` interface (`hash`, `verify`,
  `needsRehash`). Parameters: 19 MiB memory, 2 iterations, parallelism 1, 32-byte salt, output
  encoded in the standard `$argon2id$` string so parameters travel with the hash.
- **Rationale**: the native `argon2` package needs Node addons and fails `worker-build`;
  `hash-wasm` is pure WebAssembly, runs identically on both runtimes, and the constitution
  mandates Argon2id. Parameters follow the OWASP minimum for Argon2id with the Workers CPU budget
  in mind.
- **Alternatives considered**: `@node-rs/argon2` (native, Node-only unless the WASI build is
  used, larger); scrypt via WebCrypto (available on both but the constitution names Argon2id).

## R2. Sessions, cookies and CSRF

- **Decision**: opaque 256-bit random session ids, stored as SHA-256 hashes in a `sessions`
  table through `SessionStore` (`create`, `get`, `touch`, `revoke`, `revokeAllExcept`). Cookie
  `__Host-desk_session`, HttpOnly, Secure, SameSite=Lax, path `/`, 30-day idle expiry, rotated
  on login and password reset. CSRF double-submit: a readable `desk_csrf` cookie whose value
  must be echoed in the `X-CSRF-Token` header on every non-GET request.
- **Rationale**: revocable server-side sessions are required for a product holding third-party
  tokens; hashing the id in storage means a database leak does not yield live sessions; the
  `__Host-` prefix pins the cookie to the origin. Double-submit is stateless and works on
  Workers without KV.
- **Alternatives considered**: JWT access tokens (not instantly revocable); SameSite=Strict
  (breaks the return from Google and Notion consent screens); Origin-header-only CSRF (kept as a
  second check, not the only one).

## R3. Google sign-in

- **Decision**: hand-written authorization-code flow with PKCE against Google's OpenID
  discovery document, scopes `openid email profile`, ID token verified with `jose`
  (`createRemoteJWKSet` + `jwtVerify`, WebCrypto based). Google account linked by `sub` in an
  `oauth_accounts` table; first sign-in with a verified Google email creates or links the user.
- **Rationale**: the flow is about 80 lines and `jose` runs on both runtimes; it avoids a
  Node-only client library and keeps scopes minimal for the v2 Calendar expansion.
- **Alternatives considered**: `openid-client` (Node-only); Lucia/Arctic (Arctic works on
  Workers but adds a dependency for one provider); Firebase Auth (external dependency on user
  data).

## R4. Transactional email

- **Decision**: `Mailer` interface (`send({to, subject, text, html})`) with two implementations:
  Resend over `fetch` (assumed provider, ADR-0002 item 2) and SMTP to Mailpit in compose via a
  small Node-only adapter used only in local/e2e-ci. Templates are plain functions in
  `apps/api/src/mail/` returning text and HTML.
- **Rationale**: Resend's API is a single `fetch`, so it works on Workers; Mailpit gives
  Playwright a way to read the verification and reset links deterministically.
- **Alternatives considered**: Postmark (equally viable; owner's call); Nodemailer in production
  (Node-only).

## R5. Money representation and rounding

- **Decision**: `Money = { minor: number; currency: CurrencyCode }` in `packages/core` with
  `Number.isSafeInteger` enforced at construction; an embedded ISO 4217 table gives each
  currency's exponent (0, 2 or 3) and drives parsing and formatting; conversion is
  `roundHalfEven(minor * rate * 10^(expTo - expFrom))`; rates are stored as decimal strings and
  multiplied as scaled integers to avoid binary float error. Sums are integer additions only.
- **Rationale**: safe integers cover 9 × 10^15 minor units, far above any personal ledger;
  half-even rounding is the accounting default and has no bias on sums; property tests
  (fast-check) assert that sums of converted amounts are exact integer sums (SC-003), that
  converting a sum differs from summing conversions by at most one minor unit per row, and that
  parse/format round-trip for every currency in the table.
- **Alternatives considered**: `bigint` (awkward with JSON and Drizzle numeric columns, no
  practical need); `dinero.js` (adds a dependency for what is ~150 lines); float amounts
  (forbidden by the constitution).

## R6. Exchange rates and non-trading days

- **Decision**: `RatesProvider` interface (`rate(date, from, to)`) with a frankfurter
  implementation, a fake, and recorded fixtures. On demand: query `/{date}?from=X&to=Y`,
  frankfurter answers with the closest prior published date, which is stored as `rate_date`
  alongside the requested expense date. Cache table `fx_rates(rate_date, base, quote, rate)`
  shared by all users. Nightly job `rates.warm` prefetches today's rates for every (from, to)
  pair seen in the last 90 days. If the provider is down the expense saves with
  `amount_default = NULL` and a `rates.retry` job fills it later; the UI shows "waiting for
  rate".
- **Rationale**: frankfurter already implements the weekend/holiday fallback and returns the
  actual date, satisfying FR-008 without a holiday calendar; per-pair caching keeps the math a
  single multiplication; the nightly warm keeps the common path off the network.
- **Alternatives considered**: storing the full EUR table and deriving cross rates (more rows,
  more code, same result); a paid rates API (unnecessary for daily ECB fixes).

## R7. Background jobs and the currency-change re-derivation

- **Decision**: `JobRunner` with one `runJob(name, payload)` entry point and a `jobs` table
  (`queued`, `running`, `done`, `failed`, progress counters). Stage 1 triggers: a Fly scheduled
  machine runs `pnpm jobs:tick` every 5 minutes, which claims due jobs with `SELECT ... FOR
  UPDATE SKIP LOCKED`; Stage 2: a Cron Trigger calls the same function. The currency change job
  processes expenses in batches of 500 ordered by id, is idempotent (each row is re-derived
  from its original amount), and writes progress after every batch so the UI can poll
  `/jobs/:id`.
- **Rationale**: one table and one entry point serve both stages; batches keep Workers within
  CPU limits and make the job resumable after a crash.
- **Alternatives considered**: pg-boss (Node-only, heavier); Cloudflare Queues (Stage 2 only);
  running the change inline in the request (times out at scale target).

## R8. Notion two-way sync

- **Decision**: connector on Notion API version `2025-09-03` (data sources), Notion public
  OAuth, tokens encrypted with AES-256-GCM via WebCrypto (`SecretBox` interface, key from env).
  Sync engine in `packages/core/sync` is a pure function `diff(localRows, remoteRows,
  cursor) -> {toNotion, toLocal, conflicts}` using `notion_page_id` and `last_edited_time`;
  conflicts resolve latest-edit-wins and both versions are written to `expense_versions`. A
  `notion.sync` job runs every 5 minutes per connected user and immediately after an app-side
  write (debounced 10 s). Client honours Notion's 3 requests/second with a token bucket and
  retries on 429 with the `Retry-After` header. Notion change webhooks are not used in v1.
- **Rationale**: a pure diff function is fully testable with scripted scenarios (create both
  sides, edit both sides, delete one side, rate limits, clock skew) against the fake; polling is
  simple and meets the five-minute promise; webhooks are beta and property-only in 2026.
- **Alternatives considered**: Notion webhooks as the trigger (beta, incomplete); CRDT-style
  merge (overkill for single-user rows).

## R9. Generic capture address

- **Decision**: `POST /hooks/generic/:token` with a 32-byte base64url token stored hashed in
  `capture_tokens`; body `{amount, currency, date?, description, category?, id?}` validated by
  zod; `id` (or, absent, a hash of the body plus the minute) stored in `capture_receipts` with a
  unique `(token_id, receipt_key)` so replays return 200 with the existing expense id. Per-token
  rate limit 60/min. Rotation issues a new token and revokes the old one immediately. Contract in
  `contracts/generic-webhook.md`.
- **Rationale**: matches the phone-automation use case (Shortcuts, MacroDroid) with the smallest
  surface; replay safety is a unique index, not logic.
- **Alternatives considered**: HMAC-signed payloads (automations cannot sign easily); short
  numeric PINs (guessable).

## R10. Rate limiting on both runtimes

- **Decision**: `RateLimiter` interface with a Postgres fixed-window implementation
  (`rate_limits(key, window_start, count)`, upsert per request) used on auth routes (per IP and
  per email), capture addresses (per token) and the feedback endpoint; Stage 2 may swap to the
  Workers Rate Limiting binding.
- **Rationale**: works unchanged on both runtimes and across multiple machines; auth traffic is
  small enough that one upsert per attempt is negligible.
- **Alternatives considered**: in-memory limiter (not shared across machines or Workers
  isolates); Redis (a new service).

## R11. Security headers and CSP with nonces

- **Decision**: Hono `secureHeaders` middleware with a per-request nonce; the API serves the
  SPA's `index.html` by injecting the nonce into its module script tag (Vite's `html.cspNonce`
  option makes the build emit `nonce` attributes). HSTS one year with preload after the beta.
  Static assets get long-lived immutable caching.
- **Rationale**: strict CSP is in the security baseline; nonce injection at serve time is ~20
  lines and keeps the SPA otherwise static.
- **Alternatives considered**: hash-based CSP (breaks on each build), no inline scripts at all
  (Vite still emits the module preload polyfill).

## R12. CSV import

- **Decision**: server-side parsing with `papaparse` (pure JS, Workers-safe), 5 MB limit,
  streamed into `import_rows` with per-row status; `import_profiles` store a named column
  mapping per user (date, amount, currency, description, category, id, date format, decimal
  separator). Fingerprint in core: SHA-256 of `date|amountMinor|currency|normalizedDescription`
  where normalisation lowercases and collapses whitespace. A mapped id column takes precedence.
  Rows matching an existing expense fingerprint or id are marked `duplicate`.
- **Rationale**: server-side parsing gives one implementation for web and future API clients;
  storing rows makes preview, fix, skip and undo possible without re-uploading.
- **Alternatives considered**: client-side parsing (would duplicate mapping logic in the API
  for undo); `csv-parse` (Node streams, not Workers-friendly).

## R13. Offline add-queue and idempotent creates

- **Decision**: expenses get client-generated UUID v7 ids; `POST /expenses` is an insert-if-
  absent on that id so a queued create can be retried safely. The web app stores pending creates
  in IndexedDB (`idb` wrapper) and flushes them on `online`, on app start and via Background
  Sync where available; the UI shows a quiet "n pending" indicator only while the queue is
  non-empty. Edits made offline are not queued in v1 (form disabled offline except for add).
- **Rationale**: idempotency by id removes the need for a separate idempotency-key store;
  add-only offline covers the spec's story without conflict handling in the browser.
- **Alternatives considered**: full offline replica (RxDB, WatermelonDB) rejected as far beyond
  the need; server-generated ids with an `Idempotency-Key` header (a second table for the same
  guarantee).

## R14. Charts and design system

- **Decision**: hand-written SVG components in `packages/ui/charts` (bars, budget ticks, sparkline
  trend) following the dashboard's dataviz rules: single hue, budget tick marks, warn/critical
  fills only for over-budget, and a table view always rendered alongside for accessibility and
  snapshot tests.
- **Rationale**: mandated by the constitution; keeps bundle small and snapshots deterministic.
- **Alternatives considered**: Chart.js, ECharts (rejected in CLAUDE.md).

## R15. Observability and error tracking

- **Decision**: `Logger` interface writing one JSON line per event to stdout on both runtimes
  (request id, user id hash, route, status, duration); Fly ships logs, Workers Logs captures
  them. Phase 5 adds Sentry via `@sentry/node` and `@sentry/cloudflare` behind the same
  interface (free tier), an uptime check on `/healthz` from an external free monitor, and a
  weekly usage digest job emailing the owner.
- **Rationale**: JSON to stdout is the lowest common denominator; the interface allows Sentry
  without touching handlers.
- **Alternatives considered**: pino (Node-only transports), OpenTelemetry (too heavy for one
  developer).

## R16. Export, deletion and backups

- **Decision**: `GET /me/export` streams one JSON document (user, categories, budgets,
  expenses with conversion fields, connections without secrets); `DELETE /me` runs inside one
  transaction relying on `ON DELETE CASCADE` on every user-owned table, revokes Notion tokens
  first, then deletes the user row. Nightly `pg_dump` to Cloudflare R2 from the Fly scheduled
  machine; restore runbook in `docs/runbooks/restore.md` rehearsed in Phase 5 with a 4-hour RTO.
- **Rationale**: cascade constraints make the wipe complete by construction and testable by
  counting rows per table after deletion.
- **Alternatives considered**: soft-deleting users (contradicts "wipe").

## R17. e2e-ci mocks and quality gates

- **Decision**: `infra/mocks` is a tiny Hono server exposing frankfurter and Notion fakes built
  from `packages/connectors/*/fake`, seeded from the recorded fixtures, with a frozen clock
  endpoint the API honours in test mode. Playwright runs `@axe-core/playwright` on every page
  object and `@lhci/cli` asserts performance >= 90 and accessibility >= 95 (PWA category added in
  Phase 4). Mailpit provides mail assertions.
- **Rationale**: fakes validated against the same fixtures as the real clients cannot drift;
  one compose stack serves local dev and CI.
- **Alternatives considered**: MSW in the browser (does not cover the API's outbound calls).

## R18. PWA and landing page

- **Decision**: `vite-plugin-pwa` (Workbox `generateSW`, navigation fallback to the SPA, runtime
  cache for fonts), manifest with a `shortcuts` entry for `/add`, install prompt after the
  second visit; landing in `apps/landing` with `vite-ssg`, sharing `packages/ui` tokens.
- **Rationale**: the installed-app and home-screen shortcut stories map directly to manifest
  features; SSG keeps the landing page static and fast for Lighthouse.
- **Alternatives considered**: hand-written service worker (more code, same result).

## Owner decisions pending in ADR-0002 (defaults assumed by this plan)

| Item | Default assumed | Phase that needs it |
|------|-----------------|---------------------|
| Product name and domain | "Desk", `desk-staging.fly.dev` | Phase 4 (landing, OAuth consent screen) |
| Email provider | Resend | Phase 1 (verification, reset) |
| Stage 1 database | Neon from day one (branch per preview) | Phase 1 (preview databases) |
| Licence | MIT (file already present) | Before the repo goes public |
| Analytics | None | Phase 4 privacy page |

Sources: OWASP Password Storage and Forgot Password cheat sheets; frankfurter.app documentation
on date fallback; Notion API reference 2025-09-03 and rate limits; Vite `html.cspNonce`;
Workbox `generateSW`; Cloudflare Workers compatibility notes for WebCrypto and WebAssembly.
