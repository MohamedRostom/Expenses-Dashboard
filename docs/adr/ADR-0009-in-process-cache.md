# ADR-0009: Keep rarely changing data in process memory

**Status:** Accepted
**Date:** 2026-11-27
**Deciders:** Rostom (owner)
**Relates to:** ADR-0001 (platform, Stage 2 on Workers), commit `17c8edb`

## Context

Two tables are read on almost every request yet almost never change. `flags` global rows change
only through a deploy or the flags CLI, but every flag-gated request read them all. `fx_rates`
rows are inserted with `ON CONFLICT DO NOTHING` and never updated, so the rate published for a
given date is immutable, yet every conversion looked it up again. Stage 1 runs one Fly container
with no shared cache service; Stage 2 runs many short-lived Workers isolates. Whatever we choose
must work in both without a new dependency.

## Decision

The API keeps both in module-level memory, keyed per database handle (`WeakMap<Db, …>`, so every
test harness gets its own copy):

- **Global flag rows:** one cached read per process, reloaded after 60 seconds
  (`packages/db/src/flags.ts`, `FLAG_TTL_MS`). `setGlobalFlag` drops the copy in the process that
  wrote it. Per-user overrides are not cached and still apply on the next request.
- **Exchange rates:** a rate is remembered only when its `rate_date` equals the date asked for,
  since only that is final; a weekend or holiday fallback is looked up each time, because the
  real rate may be published later. The memo holds at most 10,000 entries and is cleared when
  full (`apps/api/src/services/rates.ts`, `MAX_MEMO`).

## Alternatives Considered

### Cloudflare KV or Redis as a shared cache
- **Pros:** one copy for every instance; an invalidation reaches all of them.
- **Cons:** a new service on Stage 1, a network round trip that costs about what the Postgres
  read it replaces costs, and KV is itself eventually consistent (up to 60 s).
- **Why not:** it adds infrastructure without beating the 60 s staleness we accept.

### Postgres LISTEN/NOTIFY to invalidate every instance at once
- **Pros:** a global flag change would show everywhere immediately.
- **Cons:** needs a connection held open to listen; Workers behind Hyperdrive cannot hold one.
- **Why not:** it breaks on Stage 2, which ADR-0001 rules out.

### No cache
- **Pros:** every read is current.
- **Cons:** one extra query on every gated request and every conversion.
- **Why not:** the data barely changes, so the queries buy nothing.

## Consequences

### Positive
- A gated request no longer reads the `flags` table; repeat conversions for a published date cost
  no query. `apps/api/test/flags.test.ts` and `expenses.test.ts` count the queries to prove it.
- Nothing new to deploy, and the code is the same on Node and Workers.

### Negative
- A `flags --global` change reaches other running processes within 60 seconds, not at once. The
  comment at the top of `flags-cli.ts` says so.
- On Workers each isolate keeps its own copy, so for up to a minute two requests can see
  different global flag values.

### Risks
- If a flag ever has to work as an instant kill switch, 60 seconds is too slow. That is the
  trigger to shorten the TTL for that flag or move flags to a store that can push changes.
- A user-supplied currency pair can't grow the memo without limit: it is capped and cleared.
