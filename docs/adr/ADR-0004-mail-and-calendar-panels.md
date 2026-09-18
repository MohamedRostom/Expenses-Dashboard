# ADR-0004: Mail and calendar panels, including Google mail

**Status:** Accepted
**Date:** 2026-09-17
**Deciders:** Rostom (owner)
**Amends:** ADR-0001 (v1 scope: "Gmail is dropped from the public product", "Google Calendar comes in v2")

## Context

ADR-0001 kept the public product to expenses only. It deferred Google Calendar to v2 because
calendar access is a sensitive scope that needs Google's app verification, and it dropped Gmail
entirely because reading mail is a restricted scope that additionally requires an independent
security assessment (Google's CASA programme) before Google approves the app.

The owner's personal dashboard, which this product grew out of, has always had two more panels:
the next seven days across calendars and a read-only view of recent mail. The baseline spec
`specs/002-mail-calendar-panels/spec.md` describes bringing both to every Desk user across
several providers (Google, Microsoft, Yahoo and any provider that speaks the open mail and
calendar standards). Writing that spec forced the Gmail question back open.

## Decision

Desk will add the two panels as a v2 feature, after the Phase 6 cut-over in `docs/ROADMAP.md`,
under these terms:

- **Google mail is in, and the assessment is accepted.** Desk will request Google's read-only
  mail scope and submit to the restricted-scope verification, including the independent
  security assessment. Google mail is not offered to users until that passes; Google calendar
  and every other provider ship before it.
- **Read-only, headers only.** Both panels only read. The inbox panel stores sender, subject, a
  one-line preview and received time, never bodies or attachments, capped at fifty messages per
  account. Actions on mail happen in the provider.
- **No link to expenses.** Mail and calendar data live in their own tables and never feed,
  suggest or attach to an expense.
- **Providers.** Dedicated connections for Google and Microsoft; a standards-based connection
  (open mail and calendar protocols with an app-specific password) for Yahoo, Apple, Fastmail
  and self-hosted servers.
- **Prerequisites.** Product name, domain and privacy page from ADR-0002; the Phase 1 OAuth
  design must allow adding scopes per connection without re-consenting the sign-in.

## Cost and timeline (estimates to confirm before scheduling)

Google's restricted-scope path has three parts: the standard app verification (free, one to
two weeks once the privacy page and demo video exist), the CASA assessment at the tier Google
assigns to a mail-reading app (an authorised lab scan; recent public pricing ranges from a few
hundred to a few thousand US dollars depending on tier and lab, taking two to six weeks), and an
annual re-assessment at similar cost. Microsoft's mail and calendar permissions need no external
assessment for a single-tenant personal app but do need publisher verification once the app is
multi-tenant. Standards-based connections need nothing beyond the user's app password.

Budget assumption for planning: one assessment cycle of up to £3,000 and eight weeks of
calendar time, spent after the beta proves demand for mail, so it never blocks the calendar
panel or the other providers.

## Consequences

- `CLAUDE.md` v1 scope line and the v2 section of `docs/ROADMAP.md` are updated in the same
  change; ADR-0001's text is kept with an amendment note.
- The Phase 1 OAuth work gains one requirement: connections are a separate table from sign-in,
  each with its own granted scopes and refresh token, so adding calendar or mail access never
  touches the `openid email profile` sign-in grant.
- The privacy page (Phase 4) must describe per-provider access before any of this ships, and
  Google's verification will review it.
- Feature flags gate each provider independently, so Google mail can stay dark in production
  until the assessment passes while the rest of the feature is live.
- Rejected alternatives: excluding Google mail (covers most users' calendars but leaves the
  most common mailbox out, undermining the "all your inboxes" promise); deferring all mail
  (loses the second panel entirely); acting on mail from the panel (doubles the consent surface
  for little dashboard value).
