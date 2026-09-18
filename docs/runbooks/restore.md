# Restore runbook

Restores a Postgres backup produced by `infra/fly/backup.sh` (nightly `pg_dump | gzip` to
Cloudflare R2). Budget: **4-hour RTO**, broken into the steps below. Rehearse this in Phase 5
against a real backup, not just read it.

Trigger: data loss/corruption on the primary Postgres, or a scheduled restore drill.

## 1. Declare the incident (5 min)

Note the time, what's believed lost, and which backup date you're restoring to. If the primary
is still receiving writes, stop the app first (`flyctl scale count 0` for the API app) so the
restore target isn't a moving one.

## 2. Fetch the backup from R2 (15 min)

```sh
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT"          # find the target date
aws s3 cp "s3://$R2_BUCKET/backup-YYYYMMDD.sql.gz" ./restore.sql.gz --endpoint-url "$R2_ENDPOINT"
```

## 3. Provision a fresh Postgres (30 min)

Stage 1: a new Fly Postgres app (`flyctl postgres create`) or a scratch container — never
restore over the live primary in place; restoring into a fresh instance lets you verify before
cutover. Stage 2: a new Neon branch/project.

## 4. Restore (30–60 min, scales with data size)

```sh
gunzip -c restore.sql.gz | psql "$RESTORE_DATABASE_URL"
```

Then bring the schema to the current migration head (the dump is data, migrations are the
source of truth for structure — running them is a no-op if the dump already matches):

```sh
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @desk/db migrate
```

## 5. Verify (30 min)

Run `packages/db/src/verify-totals.sql` against **both** the last-known-good state (if you have
a pre-incident snapshot or the old primary is still reachable read-only) and the restored
database, and diff the two result sets — same `expense_count` and `total_minor` per user is the
pass condition. Also spot-check a handful of individual users' month views once the app points
at the restored database.

```sh
psql "$RESTORE_DATABASE_URL" -f packages/db/src/verify-totals.sql
```

## 6. Cut over (30 min)

Point `DATABASE_URL` (Fly secret / Cloudflare Hyperdrive binding) at the restored database,
redeploy, `flyctl scale count 1` to bring the app back up, and confirm `/healthz` reports
`db: "ok"`.

## 7. Retrospective (remaining budget)

Record actual elapsed time per step against the estimates above, and what backup gap (time
between the incident and the last nightly backup) was accepted — nightly backups mean up to 24h
of data loss in the worst case; note this in the incident writeup and revisit the backup cadence
if that gap proves too wide for the business.

## Reference

- Backup script: `infra/fly/backup.sh`.
- Retention: 30 days via an R2 lifecycle rule (Cloudflare dashboard), not scripted deletion —
  see the comment at the top of `backup.sh`.
- Verification query: `packages/db/src/verify-totals.sql`.
