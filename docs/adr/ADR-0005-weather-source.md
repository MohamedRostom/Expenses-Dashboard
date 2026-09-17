# ADR-0005: Open-Meteo as the only weather and place-search source

**Status:** Accepted
**Date:** 2026-09-17
**Deciders:** Rostom (owner)
**Relates to:** ADR-0001 (platform), ADR-0002 (providers, open items), `specs/003-dashboard-widgets/spec.md`

## Context

The dashboard widgets feature adds a weather widget and a sunrise-and-sunset widget. Both need
a forecast source and a way to turn a typed place name (or, on an explicit tap, device
coordinates) into a named place with a time zone. The constitution (Principle V) makes provider
choices the owner's decision, and the platform rules (Principle II) require any source to be
reachable with plain `fetch` from both the Fly.io container and Cloudflare Workers.

The spec fixes the behaviour that constrains the choice: no key or account per user, a server-side
cache shared per place so the source is never called per device or per user, hourly freshness
for active places, place search with region and country in the results, and daily sunrise and
sunset data from the same source so no second provider is introduced.

## Decision

Desk uses **Open-Meteo** (`api.open-meteo.com` for forecasts, `geocoding-api.open-meteo.com` for
place search and reverse lookup) under its free, non-commercial tier.

- **Why it fits:** no API key, JSON over plain HTTPS `GET` (Workers-compatible), a geocoding
  endpoint that returns name, region, country, coordinates and IANA time zone, a forecast
  endpoint that returns current conditions plus daily highs, lows, sunrise, sunset and daylight
  duration in one call, and data licensed CC-BY 4.0.
- **Licence position:** Open-Meteo's free tier is for non-commercial use, which its terms
  illustrate with "private or non-profit websites or apps that do not have subscriptions or
  advertising". Desk is free, has no advertising and no subscriptions, and is treated as within
  that definition. This ADR must be revisited before Desk introduces any paid tier, sponsorship
  or advertising; at that point Open-Meteo's paid API (keyed, same endpoints) is the drop-in
  replacement.
- **Attribution:** "Weather data by Open-Meteo.com" appears in the weather and sunrise widget
  footers and on the privacy page, satisfying CC-BY.
- **Quota:** the free tier allows roughly 10,000 calls per day, 5,000 per hour and 600 per
  minute across the whole deployment. The spec's controls (one cached reading per place keyed
  on coordinates rounded to two decimals, hourly refresh only for places with an active user,
  place search on three or more characters after a typing pause, ten searches per user per
  minute, search results cached for a day) keep a thousand users well under a tenth of that.
  Quota exhaustion is a handled state (widgets show the last reading marked stale with the cause),
  never an outage.
- **Privacy:** only a place's rounded coordinates are ever sent to Open-Meteo; device
  coordinates from "use my current location" are sent once to the reverse-geocoding endpoint to
  find the nearest place and are then discarded. The privacy page says so, and names the source.

## "Use my current location" without a second source

Open-Meteo's geocoding endpoint searches by name only. Rather than add a second third party
for one rare step, Desk resolves device coordinates approximately using Open-Meteo alone:
the nearest place already known (in `geocode_cache` or the user's `places`) within 0.05°, else
a forecast call with `timezone=auto` to learn the zone and a name search for the zone's city,
shown as "near <city>" for the user to confirm or replace by typing. Rounded coordinates are
sent once and never stored. Owner decision 2026-09-17: no third-party reverse geocoder
(Nominatim was considered and rejected to keep the feature to one source).

## Consequences

- No new dependency: both endpoints are called with `fetch`; the client, its fake and recorded
  fixtures live in `packages/connectors/src/open-meteo/`.
- A feature flag per widget type (`widgets.weather`, `widgets.sunrise`) lets the source be paused
  without a release if the terms or quota change.
- WMO weather codes returned by the forecast endpoint are mapped to a small table of condition
  words and icons owned by Desk.
- Revisit triggers: any monetisation of Desk; sustained daily usage above 5,000 calls; a change
  to Open-Meteo's terms.

## Alternatives considered

- **OpenWeatherMap free tier:** keyed (a secret in every environment and in `local-secrets`),
  1,000 calls per day per key, separate geocoding endpoint without time zone; rejected for the
  key handling and the smaller quota.
- **Met Office / national services:** country-specific coverage; rejected because users are
  anywhere.
- **Browser-side calls from the PWA:** would call the source once per device, leak the place to
  the client's network and break the shared cache; rejected by the spec.
