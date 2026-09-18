#!/usr/bin/env bash
# T114: nightly pg_dump to Cloudflare R2 (S3-compatible), research.md R16.
#
# Invoked the same way jobs:tick is (see fly.toml's comment): Fly has no native scheduled-machine
# primitive yet, so an external scheduler (GitHub Actions `schedule` calling
# `flyctl ssh console -C "infra/fly/backup.sh"`, or a woken always-off machine) runs this on a
# nightly cadence. All required env vars are optional/commented in .env.example — Rostom
# configures the R2 bucket and credentials as an owner action; until then this script exits 0
# without uploading, so it never breaks a schedule that runs before those secrets exist.
#
# Retention: this script only uploads. 30-day retention is enforced by an R2 lifecycle rule
# configured in the Cloudflare dashboard (Object lifecycle rules -> delete after 30 days) rather
# than scripted here — the simpler, less-code-to-get-wrong real-world approach (ponytail: no
# list+filter+delete loop to maintain; if R2 lifecycle rules ever prove insufficient, add one).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

if [[ -z "${R2_ENDPOINT:-}" || -z "${R2_BUCKET:-}" || -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "backup.sh: R2 env vars not configured — skipping (owner action, see .env.example)."
  exit 0
fi

STAMP="$(date -u +%Y%m%d)"
FILE="backup-${STAMP}.sql.gz"
TMP="$(mktemp -d)/${FILE}"

pg_dump "$DATABASE_URL" | gzip > "$TMP"

aws s3 cp "$TMP" "s3://${R2_BUCKET}/${FILE}" --endpoint-url "$R2_ENDPOINT"

rm -f "$TMP"
echo "backup.sh: uploaded ${FILE} to ${R2_BUCKET}"
