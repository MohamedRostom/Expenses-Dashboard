# Stage 1 → Stage 2 cut-over runbook (Phase 6, `v1.0.0`)

Moves the live app from Fly (Stage 1) to Cloudflare Workers + Pages + Neon-via-Hyperdrive
(Stage 2), per `docs/ROADMAP.md` Phase 6 and `.github/workflows/deploy-cf.yml` (T118). Executed
by Rostom — this document is the procedure, not an authorization to run it.

**Both stages use the same database.** ADR-0002 item 3 (decided 2026-09-20) put every environment
on Neon from day one, and Stage 2 reaches the same Neon `production` branch through Hyperdrive. So
this cut-over moves traffic, not data: there is no dump, no restore and no read-only window.
While DNS propagates, requests reaching either stage read and write the one database, so no
write can be lost or split between them. (An earlier draft of this runbook assumed Stage 1 might
be on Fly Postgres and asked for a `MAINTENANCE_MODE` read-only switch and a `pg_dump` step; both
were only needed for a data migration and are dropped.)

**Sessions do not carry over.** Stage 1 keeps sessions in Postgres (`PgSessionStore`, `node.ts`)
and Stage 2 keeps them in KV (`KvSessionStore`, `worker.ts`), so every user is signed out once
when their DNS resolves to Stage 2 (and again on a rollback). Their data is untouched; they sign
in again. Announce this in advance.

## 0. Preconditions

- `deploy-cf.yml` has run green at least once against a tag (proves the Worker deploys, Pages
  deploys, and the full e2e-ci suite passes against the Cloudflare preview).
- `infra/cloudflare/wrangler.toml`'s `[[hyperdrive]]` and `[[kv_namespaces]]` `id` placeholders
  are replaced with real resource ids (`wrangler hyperdrive create`, `wrangler kv namespace
  create` — see the comments in that file). The Hyperdrive config's origin is the **same**
  connection string as the `PRODUCTION_DATABASE_URL` repo secret — check this before starting;
  pointing it anywhere else turns this into a data migration and this runbook no longer applies.
- The Worker has the same `SECRET_BOX_KEY` as `ros-desk-production` (`wrangler secret put`). A
  different value makes every stored connector token (Notion) undecryptable.
- Background jobs: both stages may run the job queue during the overlap. That is safe — the
  runner claims jobs with `FOR UPDATE SKIP LOCKED` (`apps/api/src/jobs/runner.ts`), so no job runs
  twice — but keep Stage 2's Cron Trigger disabled until step 3 to keep the logs readable.
- Lower the TTL on the DNS records to 300s or less a day ahead, so the flip and any rollback
  take minutes.
- Tell users (in-app banner and the feedback-digest email list) that they will need to sign in
  again once, on the cut-over date.

## 1. Totals baseline

Save the per-user totals before the flip:

```
psql "$PRODUCTION_DATABASE_URL" -f packages/db/src/verify-totals.sql > before.txt
```

Then sign in through the Stage 2 preview as a known test user and confirm its month total
matches that user's row in `before.txt`. A mismatch means Hyperdrive points at the wrong
database — stop.

## 2. DNS flip

- Registrar: **[Rostom to fill in]**. Point the app's custom domain (also a placeholder —
  ADR-0002 item 1, product name, is still open, so no domain is chosen yet) at the Cloudflare
  Pages project (`desk-web`) and the API worker's route.
- Cloudflare gives free TLS on the custom domain automatically once DNS resolves through it —
  no manual cert step.
- The cut-over is done when DNS has propagated and `smoke-custom-domain` in `deploy-cf.yml` has
  passed against the real domain.

## 3. After the flip

- Enable Stage 2's Cron Trigger and confirm a job pass completes.
- Re-run the totals query into `after.txt`; `diff before.txt after.txt` may only show rows for
  users who added, edited or deleted expenses since step 1 — never a missing user or a total that
  moved without a matching change.
- Watch the uptime check (`docs/runbooks/uptime.md`) for an hour.

## 4. Rollback (one-hour path)

Stage 1 (`ros-desk-production` on Fly) is left running, not deleted, for this exact reason:

1. Flip DNS back to Fly's `ros-desk-production.fly.dev` (or its own custom-domain record,
   whichever was live before step 2).
2. Disable Stage 2's Cron Trigger.

Nothing else: the database is shared, so every write made through Stage 2 is already visible to
Stage 1, and no code rollback is needed because Stage 1's `node.ts` never stopped running. Users
signed in on Stage 2 must sign in again (their old Stage 1 sessions still work if not expired).
DNS TTL is the only real delay, which is why it is lowered in step 0.

## 5. 30-day fallback, then scale Stage 1 to zero

Per the roadmap exit criteria: keep Stage 1 deployed (not serving live traffic) for 30 days after
a successful cut-over, as the rollback target above. After 30 days with no incident:

```
fly scale count 0 --app ros-desk-production
```

Stage 1 stays scaled to zero (not deleted) so `fly scale count 1` is still a fast un-rollback if
something surfaces later; delete the app only well after that, per Rostom's own call. Disable the
Fly-side `jobs-safety-net.yml` schedule at the same time, since Stage 2's Cron Trigger replaces it.

## Execution note

This runbook is written, not run. Tagging `v1.0.0` and executing the steps above are Rostom's
own actions, after the beta (roadmap Phase 5) meets its exit criteria. No Cloudflare resources
exist yet (Hyperdrive/KV ids are still placeholders in `infra/cloudflare/wrangler.toml`).
