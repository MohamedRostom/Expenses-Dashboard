# Uptime monitoring (Phase 5)

An external monitor, not GitHub Actions, watches production between deploys — Actions has no
always-on process to run a check every minute.

## Setup

1. Pick a free external monitor: **UptimeRobot** (free tier, 50 monitors, 5-minute interval on
   the free plan — use the paid tier or a webhook-based workaround for 1-minute) or
   **Better Uptime** (free tier includes 1-minute checks on a limited number of monitors). Either
   works; pick whichever Rostom already has an account with.
2. Add an HTTP(S) monitor:
   - URL: `https://ros-desk-production.fly.dev/healthz` (swap for the custom domain after the
     Cloudflare cut-over, docs/runbooks/cutover.md).
   - Method: GET.
   - Expected: HTTP 200 and response body contains `"status":"ok"` (the monitor's keyword/JSON
     assertion feature — both providers above support matching response content, not just the
     status code).
   - Interval: **1 minute**.
   - Alert after: **3 consecutive failures** (roughly a 3-minute outage before paging).
3. Alert routing: **[Rostom to fill in — email and/or SMS number]**. Point the monitor's alert
   integration at that contact directly; do not route through this repo's issue tracker (an
   outage should page a person, not wait for someone to read GitHub).

## What `/healthz` reports

`db: "ok" | "degraded"` — a degraded DB does not fail the check on its own (see smoke.spec.ts,
T111), so a monitor watching only the HTTP status code will miss a degraded-but-up database.
Prefer a monitor that can assert on the JSON body's `status` field over one that only checks the
HTTP status code, for that reason.

## Out of scope here

Deploy-time smoke testing (`smoke.spec.ts` via `.github/workflows/deploy-fly.yml`) and this
between-deploys uptime check are two different layers — the former proves a deploy is good
before traffic reaches it, the latter watches for regressions after (host outage, DB connection
exhaustion, a bad Fly host). Both are needed; neither replaces the other.
