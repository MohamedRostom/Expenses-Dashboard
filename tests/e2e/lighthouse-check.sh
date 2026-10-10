#!/bin/sh
# Fails if any audited page in a Lighthouse CI run ended on /login (the session cookie was not
# accepted, so the run measured the sign-in page instead of the signed-in app). Usage: sh lighthouse-check.sh [dir]
set -eu
dir="${1:-./lighthouse-reports}"
found=0
for f in "$dir"/*.report.json; do
  [ -e "$f" ] || continue
  found=1
  url=$(grep -o '"finalDisplayedUrl": *"[^"]*"' "$f" | head -1 | sed 's/.*: *"//; s/"$//')
  echo "audited: $url"
  case "$url" in */login*) echo "FAIL: audited the sign-in page, not the signed-in app" >&2; exit 1 ;; esac
done
[ "$found" = 1 ] || { echo "FAIL: no Lighthouse reports in $dir" >&2; exit 1; }
