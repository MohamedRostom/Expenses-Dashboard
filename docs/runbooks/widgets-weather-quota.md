# Weather source quota and outages (spec 003)

The weather, sunrise and place-search widgets read Open-Meteo (ADR-0005), a keyless free tier with a daily call limit shared by every user. This runbook covers what happens when that limit is hit or the source goes down, how to read the logs, and how to switch things off.

## How the pause is set

When the weather refresh job (`apps/api/src/jobs/widgets-weather-refresh.ts`) gets a 429 from Open-Meteo, it stops the run, writes the deadline (now plus the `Retry-After` value, or the next UTC midnight when the 429 carries no `Retry-After`, per `packages/connectors/src/open-meteo/client.ts`) into the `flags` row `widgets.weather_paused_until` through `pauseWeatherUntil` in `apps/api/src/services/source-usage.ts`, and adds an audit row with action `weather.quota_pause` (actor `system`, details `{ until }`). While the deadline is in the future, `/healthz/widgets` answers 503 `{"status":"degraded"}` and weather figures show the last reading with cause `source_limit_reached`. The pause lifts itself when the deadline passes; nothing needs doing for a normal quota reset.

## Reading the daily summary

The daily `widgets.purge` job calls `emitSourceSummary` and logs one `widget_source_summary` line per source with `calls` and `failures` for today, `consecutiveFailures`, `cachedPlaces`, and a `cause`: `limit_reached` while the quota pause is in force, or `failing` once three calls in a row have failed. Each call is also logged as `widget_source_call` with `source`, `outcome` and, when failing, `cause`. Neither line carries a user id. Search the production logs for `widget_source_summary` to see how close the day came to the limit.

## Lifting a pause early

Only do this if Open-Meteo has confirmed the limit is reset. The `pnpm flags set` script only changes boolean flags (`pnpm flags set <key> --user <email>|--global on|off`), so it cannot clear the deadline, which lives in the `value` column. Clear it with SQL against the environment's database:

1. `UPDATE flags SET value = NULL WHERE key = 'widgets.weather_paused_until';`
2. Check `GET /healthz/widgets` returns 200 `{"status":"ok"}`. It stays `degraded` while any source still has three consecutive failures, which clears on the next successful call.

## Switching a kind off

Each widget kind has its own flag, off in production until announced: `widgets.currency`, `widgets.weather`, `widgets.sunrise`, `widgets.spend_pace`, `widgets.fixed_costs`. To turn weather off for everyone while the source is down, run `pnpm flags set widgets.weather --global off` with `DATABASE_URL` pointing at the target environment; it takes effect on the next request. The same command with `--user <email>` limits it to one account.

## What users see

A weather or sunrise widget with a previous reading keeps showing it, marked stale, with "The data source's daily limit is reached. Showing the last reading." (quota pause) or "Couldn't reach the data source. Showing the last reading." (source failing). With no reading yet it shows its loading frame, and a widget that cannot show anything shows "This widget is unavailable right now." Place search says "Place search is unavailable, try again later." Currency widgets are unaffected by Open-Meteo: they use the cached ECB rates.

## SC-008 rehearsal on staging

Goal: the uptime alert fires within the agreed window and the logs name the source and cause.

1. Confirm the `/healthz/widgets` monitor exists with alert routing filled in (docs/runbooks/uptime.md).
2. Make Open-Meteo fail everywhere: against the mocks service `mockOpenMeteo().failAll(true)`, or block egress to `api.open-meteo.com` from the staging machine.
3. Trigger refreshes (open a weather widget, then Refresh) and note the time of the third failed call; `/healthz/widgets` goes 503.
4. Time from that third call to the alert arriving.
5. Repeat with `pauseSource(ms)` (quota pause), then with the rates fake's `failRange(true)` or a blocked frankfurter egress.
6. In the logs, check each failure names the source (`open_meteo.forecast`, rates) and the cause (`failing`, `limit_reached`). `source_limit_reached` is only the cause the API and UI give a widget, never a log cause.
7. Undo the failure, clear any pause (above), and confirm `/healthz/widgets` returns to 200.

| Date        | Result      | Operator    |
| ----------- | ----------- | ----------- |
| not yet run | not yet run | not yet run |
