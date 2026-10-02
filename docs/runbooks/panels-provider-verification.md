# Mail and calendar panels — provider verification runbook

Gets each of the four `panels.*` production flags (`panels.google_calendar`, `panels.microsoft`,
`panels.standards`, `panels.google_mail`) from "code merged, flag off" to "flag on in
production", per `specs/002-mail-calendar-panels/research.md` R6 and ADR-0004. `panels.today` (the
page-level flag) is a plain `gh variable`-style flip once Slice A is reviewed and needs no
external verification, so it is not covered here. Executed by Rostom — this document is the
procedure, not an authorization to run it. Every step below needs the product name, domain and
privacy page from ADR-0002 to exist first (they are still `_pending_`; see `CLAUDE.md`'s T123/T124
line), because both Google and Microsoft's reviewers check the requested scopes against that
privacy page and the demo.

## 0. Preconditions common to every provider

- ADR-0002 accepted, at least for the product name, domain and privacy page items — Google and
  Microsoft verification both need a stable, publicly reachable privacy URL and app name before
  a submission can be made.
- `apps/landing/src/pages/privacy.vue`'s per-provider section (T073, sourced from
  `packages/contracts/src/privacy-text.ts`) is live at that domain and matches the scopes below
  exactly — a reviewer who finds a scope the privacy text doesn't mention fails the review.
- The connect card in `apps/web/src/views/ConnectionsView.vue` shows the same text before
  consent (FR-016); reviewers for both Google and Microsoft click through the actual consent
  flow, not just read the privacy page.

## 1. Google — OAuth consent screen verification (`panels.google_calendar`)

Scope: `https://www.googleapis.com/auth/calendar.readonly` (sensitive, not restricted — no CASA
needed for this one).

1. In Google Cloud Console, move the OAuth consent screen from "Testing" to "In production" for
   the project backing `googlePanels.clientId`.
2. Record a demo video (unlisted, unique link) that: signs in, opens Settings → Connections,
   clicks "Connect Google", shows the real Google consent screen listing the `calendar.readonly`
   scope, completes the grant, and shows the calendar panel populated with test events. Google's
   reviewers watch this to confirm the scope is actually used for what the privacy page says.
3. Submit the verification request with the privacy page URL from step 0 and the demo video
   link. Google's own timeline estimate (ADR-0004) is one to two weeks for a sensitive-scope-only
   app.
4. On approval: `gh variable set` is not used for provider flags (they are rows in the `flags`
   table, not repo variables) — flip `panels.google_calendar` to `true` for the `production`
   environment via the existing flags admin path (`packages/db` seed/update, per
   `apps/api/src/routes/me.ts`'s `GET /flags`), then confirm `GET /connections/providers` in
   production lists Google with `calendar` in its capabilities.
5. Re-verification is required if the requested scopes or the app's branding changes; re-run
   step 1–3 rather than assuming a permanent approval.

## 2. Microsoft — publisher verification (`panels.microsoft`)

Scopes: `Calendars.Read`, `Mail.Read`, `offline_access`, `User.Read`. One flag covers both
capabilities (research.md R6), so this step gates Slice B's Microsoft calendar and Slice C's
Microsoft inbox together — do not flip it on for calendar only.

1. In the Azure AD app registration backing `microsoft.clientId`, add a verified domain (the one
   from ADR-0002) under "Branding & properties" and complete Microsoft's publisher verification
   (links the app registration to a Microsoft Partner Network or Entra Verified ID identity —
   Rostom's own Microsoft account, not a company one, unless ADR-0002 picks otherwise).
2. Publisher verification is required once the app is exposed to users outside the single tenant
   it was registered under (ADR-0004's cost/timeline section) — Desk is multi-tenant by design
   (any user, any Microsoft account), so this step cannot be skipped even though Microsoft asks
   for no external assessment for a single-tenant app.
3. No consent-screen demo video is required for Microsoft the way Google asks for one, but the
   same privacy-page-matches-scopes check applies informally during any manual Microsoft review
   or support escalation, so keep it accurate regardless.
4. On approval, flip `panels.microsoft` the same way as step 1.4 above, then confirm
   `GET /connections/providers` lists Microsoft with both `calendar` and `mail` capabilities and
   that a real Microsoft sign-in completes without an "unverified publisher" warning.

## 3. Standards-based (`panels.standards`) — no provider verification, test-account gate

Yahoo, Apple (iCloud), Fastmail and self-hosted servers need no OAuth verification — the user
supplies their own app-specific password (research.md R6) — so this flag is gated on Desk's own
testing rather than an external reviewer:

1. Confirm the `local-secrets` GitHub Environment has required reviewers configured (`CLAUDE.md`
   notes it exists but had none as of 2026-09-26 — add at least Rostom before any nightly run
   that reads its secrets).
2. Confirm the test-account inventory below exists in `local-secrets` and that
   `tests/e2e/tests/today-inbox.local.spec.ts` / `today-calendar.local.spec.ts` have run green
   against them at least once on the `desk-local` runner.
3. Flip `panels.standards` the same way as step 1.4 above once the nightly e2e-local run is
   green for three consecutive nights (matches the "three trials per provider" bar research.md
   R10 sets for SC-002).

## 4. Google mail — CASA assessment (`panels.google_mail`)

Scope: `https://www.googleapis.com/auth/gmail.readonly` (restricted — needs the independent
security assessment in addition to standard verification).

1. Complete Google's standard restricted-scope verification for `gmail.readonly` the same way as
   step 1.1–1.3 above, but include the scope in both the demo video and the submission.
2. Google assigns a CASA tier once the standard verification review starts; engage an authorised
   lab at that tier. ADR-0004's budget assumption is up to £3,000 and eight weeks of calendar
   time for the first assessment cycle, spent after the beta proves demand for mail so it never
   blocks the calendar panel or the other providers — confirm with Rostom before spending
   against this budget, since it is a real invoice, not an estimate to nod through.
3. On passing the assessment, flip `panels.google_mail` the same way as step 1.4 above, then
   confirm a real Google account with `gmail.readonly` granted shows the inbox panel end to end
   (`tests/e2e/tests/today-inbox.local.spec.ts`'s Gmail case, T044, currently blocked on exactly
   this flag per that task's note).
4. CASA assessments expire annually; calendar a re-assessment before the anniversary of the pass
   date recorded here, at similar cost, or the scope is revoked by Google and the panel goes dark
   for every user with a Gmail connection.

## Test-account inventory for `local-secrets`

| Provider | Account | Used by | Status |
|----------|---------|---------|--------|
| Google | one Gmail test account | `today-calendar.local.spec.ts`, `today-inbox.local.spec.ts` (blocked on §4 until CASA passes) | Pending — needs creating |
| Microsoft | one Microsoft 365/Outlook test account | `today-calendar.local.spec.ts`, `today-inbox.local.spec.ts` | Pending — needs creating |
| Fastmail or iCloud | one standards-based account (CalDAV + IMAP) | `today-calendar.local.spec.ts`, `today-inbox.local.spec.ts` (T067) | Pending — needs creating |
| Yahoo | one account with two-step verification and an app password | the `yahoo` preset's IMAP and CalDAV endpoints (T079 spike first, then T067) | Pending — needs the T079 spike run first |

The runner `desk-local` (labels `self-hosted, Windows, X64, desk-local`) is registered and online
(checked 2026-09-26); it is what actually holds these accounts' credentials as environment
secrets when they exist. Creating the accounts and adding their secrets to `local-secrets` is
owner-only — an agent cannot sign up for a Yahoo or iCloud account on Rostom's behalf.
