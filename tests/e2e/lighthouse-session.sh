#!/bin/sh
# Signs up and verifies a throwaway user against the compose stack with curl alone (the same steps
# as signUpAndVerify in fixtures/index.ts), seeds a few expenses so the month view has content, and
# prints ONE line on stdout: the Cookie header value for that session. Everything else goes to stderr.
# Env: APP_URL (default http://localhost:4173, the production-build web-preview that proxies the API),
# MAILPIT_URL (default http://localhost:8025).
set -eu

APP_URL="${APP_URL:-http://localhost:4173}"
MAILPIT_URL="${MAILPIT_URL:-http://localhost:8025}"
PASSWORD='xk-e2e-Tr0ub4-fixture-2026' # the e2e fixture phrase (not a real secret; see fixtures/index.ts)
EMAIL="lighthouse-$(date +%s)-$$@example.com"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "lighthouse-session: $*" >&2; exit 1; }

# The CSRF cookie is rewritten on login/verify, so read the current value from the jar every time.
csrf() { sed 's/^#HttpOnly_//' "$JAR" | awk -F'\t' '$6 == "__Host-desk_csrf" { print $7 }'; }

# api METHOD PATH BODY -> prints the response body, fails on a non-2xx status.
api() {
  out="$(mktemp)"
  code="$(curl -s -o "$out" -w '%{http_code}' -b "$JAR" -c "$JAR" -X "$1" \
    -H "X-CSRF-Token: $(csrf)" -H 'Content-Type: application/json' \
    ${3:+-d "$3"} "$APP_URL$2")" || fail "curl failed for $1 $2"
  body="$(cat "$out")"; rm -f "$out"
  case "$code" in 2??) printf '%s' "$body" ;; *) fail "$1 $2 returned $code: $body" ;; esac
}

curl -sf -c "$JAR" -o /dev/null "$APP_URL/currencies" || fail "cannot reach $APP_URL (is the compose stack up?)"
api POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"defaultCurrency\":\"GBP\",\"timeZone\":\"Europe/London\"}" >/dev/null

# Poll Mailpit for the verification mail (up to 15 s), then take the token from its link.
token=''
i=0
while [ "$i" -lt 30 ] && [ -z "$token" ]; do
  id="$(curl -sf "$MAILPIT_URL/api/v1/search?query=to:$EMAIL" | grep -o '"ID":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [ -n "$id" ]; then
    token="$(curl -sf "$MAILPIT_URL/api/v1/message/$id" | grep -o 'verify?token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2 || true)"
  fi
  [ -n "$token" ] || { i=$((i + 1)); sleep 0.5; }
done
[ -n "$token" ] || fail "no verification mail for $EMAIL in Mailpit ($MAILPIT_URL)"

api POST /auth/verify "{\"token\":\"$token\"}" >/dev/null
# A freshly verified user is bounced to /onboarding until this is set (skipOnboarding in the fixtures).
api PATCH /me "{\"onboardingCompletedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >/dev/null

# Seed: 4 expenses over two categories, one foreign (EUR), dated today so the current month has content.
cats="$(api GET /categories | grep -o '"id":"[^"]*"' | cut -d'"' -f4)"
cat1="$(echo "$cats" | sed -n 1p)"; cat2="$(echo "$cats" | sed -n 2p)"
[ -n "$cat1" ] && [ -n "$cat2" ] || fail "expected at least two default categories"
today="$(date -u +%Y-%m-%d)"
add() { # description minor currency categoryId
  api POST /expenses "{\"description\":\"$1\",\"amount\":{\"minor\":$2,\"currency\":\"$3\"},\"date\":\"$today\",\"categoryId\":\"$4\",\"paidWith\":\"card\",\"kind\":\"variable\"}" >/dev/null
}
add 'Weekly shop' 4250 GBP "$cat1"
add 'Bus pass' 6000 GBP "$cat2"
add 'Lunch' 1275 GBP "$cat1"
add 'Hotel' 8900 EUR "$cat2"

sed 's/^#HttpOnly_//' "$JAR" | awk -F'\t' 'NF >= 7 && $1 !~ /^#/ { printf "%s%s=%s", sep, $6, $7; sep = "; " } END { printf "\n" }'
