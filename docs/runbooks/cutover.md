# Stage 1 → Stage 2 cut-over runbook (Phase 6, `v1.0.0`)

Moves the live app from Fly (Stage 1) to Cloudflare Workers + Pages + Neon-via-Hyperdrive
(Stage 2), per `docs/ROADMAP.md` Phase 6 and `.github/workflows/deploy-cf.yml` (T118). Executed
by Rostom — this document is the procedure, not an authorization to run it.

## 0. Preconditions

- `deploy-cf.yml` has run green at least once against a tag (proves the Worker deploys, Pages
  deploys, and the full e2e-ci suite passes against the Cloudflare preview).
- `infra/cloudflare/wrangler.toml`'s `[[hyperdrive]]` and `[[kv_namespaces]]` `id` placeholders
  are replaced with real resource ids (`wrangler hyperdrive create`, `wrangler kv namespace
  create` — see the comments in that file).
- Database: per ADR-0002 item 3, Neon is the assumed default for Stage 1 too. **If Stage 1 is
  already on Neon, skip step 2 (pg_dump) entirely** — Hyperdrive points at the same database, no
  data migration needed, only a DNS/traffic switch. Confirm which is true before starting; do
  not assume.

## 1. Read-only window on Fly

No maintenance-mode code path exists yet (checked: no `readonly`/`maintenance` concept anywhere
in `apps/api/src`). Before a real cut-over, add one — the smallest version is a `MAINTENANCE_MODE`
env var checked in a middleware ahead of the write routes, returning 503 with a `Retry-After`
header. This is a small follow-up task, not something to improvise during the cutover itself;
write and test it ahead of time, then flip the env var (`flyctl secrets set MAINTENANCE_MODE=true
--app desk-production`) to open the window and unset it to close.

Announce the window to users (in-app banner + the feedback-digest email list) before flipping it.

## 2. Data migration (skip if Stage 1 is already Neon — see step 0)

```
pg_dump "$STAGE1_DATABASE_URL" --format=custom --file=cutover.dump
pg_restore --dbname="$NEON_DATABASE_URL" --clean --if-exists cutover.dump
```

Run this only while the read-only window (step 1) is open, so no writes land on Stage 1 after
the dump is taken.

## 3. Totals check (before and after)

Run `packages/db/src/verify-totals.sql` against Stage 1 before the dump/DNS flip and again
against Stage 2 (Neon via Hyperdrive) after. Every row (per user: `expense_count`,
`total_minor`) must match exactly. Any mismatch stops the cutover — do not flip DNS.

```
psql "$STAGE1_DATABASE_URL" -f packages/db/src/verify-totals.sql > before.txt
# ... after DNS flip ...
psql "$NEON_DATABASE_URL" -f packages/db/src/verify-totals.sql > after.txt
diff before.txt after.txt   # must be empty
```

## 4. DNS flip

- Registrar: **[Rostom to fill in]**. Point the app's custom domain (also a placeholder —
  ADR-0002 item 1, product name, is still open, so no domain is chosen yet) at the Cloudflare
  Pages project (`desk-web`) and the API worker's route.
- Cloudflare gives free TLS on the custom domain automatically once DNS resolves through it —
  no manual cert step.
- Close the read-only window (unset `MAINTENANCE_MODE`) once DNS has propagated and
  `smoke-custom-domain` in `deploy-cf.yml` has passed against the real domain.

## 5. Rollback (one-hour path)

Stage 1 (`desk-production` on Fly) is left running, not deleted, for this exact reason:

1. Flip DNS back to Fly's `desk-production.fly.dev` (or its own custom-domain record, whichever
   was live before step 4).
2. Re-open the read-only window on the *Cloudflare* side is not needed — Stage 1 already has the
   data as of the last write before the dump; any writes that landed on Stage 2 after the flip
   are lost unless step 2 is re-run in reverse (Neon → Fly) before flipping back. For a same-day
   rollback this is normally acceptable (the window is short); for anything later, re-run step 3
   in reverse first.
3. No code rollback needed — Stage 1's `node.ts` never stopped running.

This whole path is designed to complete in under an hour: DNS TTL is the dominant cost, so set a
short TTL (300s or less) on the relevant records before the cutover, not after.

## 6. 30-day read-only fallback, then scale Stage 1 to zero

Per the roadmap exit criteria: keep Stage 1 running (read-only, not serving live traffic) for 30
days after a successful cut-over, as the rollback target above. After 30 days with no incident:

```
fly scale count 0 --app desk-production
```

Stage 1 stays scaled to zero (not deleted) so `fly scale count 1` is still a fast un-rollback if
something surfaces later; delete the app only well after that, per Rostom's own call.

## Execution note

This runbook is written, not run, by this task. Tagging `v1.0.0` and actually executing the
steps above are Rostom's own actions — no Cloudflare resources exist yet (Hyperdrive/KV ids are
still placeholders in `infra/cloudflare/wrangler.toml`), and a real cutover needs the
maintenance-mode code path from step 1 built and tested first.
