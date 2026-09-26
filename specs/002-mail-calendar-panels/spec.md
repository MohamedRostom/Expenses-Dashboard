# Feature Specification: Mail and Calendar Panels

**Feature Branch**: `002-mail-calendar-panels` (spec directory); planning fixes on
`feature/002-mail-calendar-panels`, delivery on one `feature/002-<slice>` branch per plan slice

**Created**: 2026-09-17

**Status**: Planned (ADR-0004 accepted 2026-09-17; plan and tasks generated)

**Input**: User description: "create a new spec baseline for the new feature in the dashboard to
represent the person mails, calender after integrating with multiple platforms like google,
yahoo, outlook, ..etc"

Desk users connect one or more personal mail and calendar accounts from different providers and
see, on a new "Today" page in the dashboard, what is coming up and what has arrived: a "next
days" calendar panel and an inbox panel, both across every connected account. The expenses
month view is unchanged. This brings the two panels of the
owner's personal dashboard (see CLAUDE.md, "Personal dashboard artifact") to every Desk user.

This spec reopens two recorded decisions, which ADR-0004 (`docs/adr/ADR-0004`, accepted
2026-09-17) records: ADR-0001 dropped mail from the public product because
Google's mail access is a restricted scope requiring an external security assessment, and placed
Calendar in v2. See Assumptions.

## Clarifications

### Session 2026-09-17

- Q: Should this feature include Google mail given the restricted-scope assessment? → A: Yes; Google mail is included and the external security assessment is accepted as a prerequisite milestone. ADR-0004 must reverse ADR-0001's "Gmail dropped" decision.
- Q: Is the inbox panel read-only or can the user act on mail from it? → A: Read-only: see, filter and open in the provider. No mark-read, archive or reply.
- Q: Should the mail panel feed the expense tracker? → A: No. Mail and calendar are dashboard panels only; no link to expenses and no message bodies are read.

### Session 2026-09-17 (pre-planning)

- Q: How many mail and calendar accounts may one user connect? → A: Ten.
- Q: Where do the two panels appear in the app? → A: On a new "Today" page in the main navigation; the month view is unchanged.
- Q: When should Desk refresh data from the providers? → A: Every five minutes while the user was active in the last 24 hours, immediately on opening Today when data is older than two minutes, hourly otherwise.
- Q: How long are cached items kept for a user who stops visiting? → A: Purged after 30 days without a visit; credentials kept; refetched on return.
- Q: Which messages count as unread and appear in the inbox panel? → A: The inbox folder only, excluding spam, archived and provider-sorted promotional or social mail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the next seven days across my calendars (Priority: P1)

A user connects a calendar account through the provider's own consent screen, and the dashboard
gains a panel listing the events of the next seven days: title, day and time (or "all day"),
location if any, and which account it belongs to. Events from several connected accounts appear
in one list. A click opens the event in the provider. Changes made in the provider appear in
Desk within a few minutes.

**Why this priority**: it is the lower-risk half of the feature (calendar access is a sensitive
scope, not a restricted one), it is the panel the owner uses daily, and it proves the
multi-provider connection model the inbox panel then reuses.

**Independent Test**: connect one Google calendar and one Microsoft calendar in a test account,
create an event in each provider dated tomorrow, and confirm both appear in the panel within
five minutes with the right account label; delete one in the provider and confirm it disappears.

**Acceptance Scenarios**:

1. **Given** a user with no connected accounts, **When** they open the Today page, **Then** the
   calendar panel shows an empty state that explains what connecting does and offers the
   supported providers.
2. **Given** a connected calendar, **When** an event exists within the next seven days, **Then**
   it is listed with title, date, start and end time in the user's time zone, "all day" where
   applicable, location, and the account's label and colour.
3. **Given** two connected calendars from different providers, **When** both have events on the
   same day, **Then** they appear in one chronological list, each with its account label.
4. **Given** an event changed or deleted in the provider, **When** five minutes pass, **Then**
   the panel reflects the change.
5. **Given** a recurring event, **When** it has occurrences within the next seven days, **Then**
   each occurrence appears once with its own date.
6. **Given** the user's time zone setting changes, **When** the panel reloads, **Then** times are
   shown in the new zone.

---

### User Story 2 - See what has arrived across my inboxes (Priority: P1)

A user connects a mail account and the dashboard gains an inbox panel showing the unread count
and the most recent messages: sender, subject, a one-line preview, received time, and which
account. Messages from all connected accounts appear together, newest first. A click opens the
message in the provider, where any action on it happens. New mail appears within a few minutes.

**Why this priority**: it is the other half of the personal dashboard; it carries the compliance
and privacy burden (Google mail waits for the external security assessment), so it ships
provider by provider rather than all at once.

**Independent Test**: connect a Microsoft mailbox and a second mailbox (Google with its flag on;
a standards-based mailbox such as Yahoo is proved the same way once User Story 4 ships) in a
test account, send each one a message, and confirm both appear in the panel within five minutes newest first;
read one in the provider and confirm the panel's unread count drops on the next refresh.

**Acceptance Scenarios**:

1. **Given** a connected mailbox, **When** a new message arrives, **Then** within five minutes
   the panel shows it with sender, subject, preview, received time and account label, and the
   unread count increases.
2. **Given** messages from two accounts, **When** the panel loads, **Then** they are interleaved
   newest first and each shows its account label.
3. **Given** a message read or archived in the provider, **When** the next refresh runs,
   **Then** the panel's unread count and list reflect it.
4. **Given** the panel, **When** the user filters by one account, **Then** only that account's
   messages and unread count are shown.
5. **Given** any message, **When** the user clicks it, **Then** it opens in the provider in a new
   tab; the panel offers no other action on it.

---

### User Story 3 - Manage connected accounts (Priority: P2)

A user sees every connected account in Settings with its provider, address, what it grants (mail,
calendar or both), status, last successful refresh and any error. They can rename its label, pick
its colour, choose which of its calendars feed the panel, pause it, reconnect it when the
provider revokes access, and disconnect it, which removes everything Desk cached from that
account.

**Why this priority**: required for trust and for the empty, error and expired states of both
panels, but only meaningful once at least one panel exists.

**Independent Test**: connect an account, revoke Desk's access from the provider's side, and
confirm Settings shows the account as needing reconnection within one refresh cycle; disconnect
it and confirm no cached messages or events remain and the panels update.

**Acceptance Scenarios**:

1. **Given** a connected account whose access the provider revoked, **When** the next refresh
   runs, **Then** the account shows "reconnect needed", its data stays visible but marked stale,
   and both panels show a reconnect prompt for that account only.
2. **Given** a paused account, **When** panels load, **Then** its items are hidden and no
   refresh runs for it until resumed.
3. **Given** a disconnected account, **When** the user looks at Settings and both panels,
   **Then** nothing from that account remains, the credential is destroyed, revocation was
   attempted where the provider supports it, and otherwise the user was shown how to remove
   Desk's access at the provider.
4. **Given** the user deletes their Desk account, **When** deletion completes, **Then** every
   connected account's credentials and cached data are gone, access is revoked at each provider
   that supports it (FR-003), and the user is shown removal instructions for the others.
5. **Given** an account with a primary and a shared calendar, **When** the user enables the
   shared calendar in Settings, **Then** its events appear in the calendar panel after the next
   refresh, and disabling it removes them (FR-007).
6. **Given** a standards-based account whose app password was revoked at the provider, **When**
   the user reconnects with a new app password, **Then** it is verified before saving, the
   account returns to "connected", and the cached items were kept throughout (FR-018).

---

### User Story 4 - Add a provider that has no dedicated integration (Priority: P3)

A user whose mail or calendar lives with a provider Desk has no dedicated connection for (a small
host, a self-hosted server, an Apple calendar) connects it through the open standards those
providers support, with an app-specific password where the provider requires one, and gets the
same panels.

**Why this priority**: widens coverage without a per-provider integration, but the mainstream
providers come first.

**Independent Test**: connect an Apple iCloud calendar and a Fastmail mailbox through their
standard protocols and confirm the panels behave exactly as with the dedicated providers.

**Acceptance Scenarios**:

1. **Given** a standards-based connection form, **When** the user enters server, address and an
   app password, **Then** the connection is verified before saving and errors name the failing
   step.
2. **Given** a standards-based account, **When** panels refresh, **Then** items appear with the
   same fields and timing as dedicated providers.

---

### Edge Cases

- Access token expires or is revoked at the provider: the account enters "reconnect needed";
  cached items stay visible but marked stale; nothing is silently dropped.
- Provider rate limits or is unreachable: the last successful data stays, the account shows the
  time of its last refresh, and refresh retries with backoff; missed refreshes show only as the
  stale mark until twenty consecutive failures set "error" (FR-004).
- Mailbox with tens of thousands of messages: only the most recent messages (a fixed cap) are
  ever fetched or cached; the panel never claims to be a complete mailbox.
- The same address connected twice with the same provider (once for mail, once for calendar):
  shown as one account with both capabilities, not two. The same address through two different
  providers (for example a Google address also added through the standards form) is two
  accounts, each counting toward the limit.
- Two accounts share a display name: labels are editable and default to the address.
- An eleventh account: the connect button is disabled with the limit shown; disconnecting one
  re-enables it. Adding the missing capability (mail or calendar) to an account already
  connected is not an eleventh account and stays available at the limit.
- A user returns after more than 30 days: panels show a loading state while everything is
  refetched, not stale items.
- All-day and multi-day events, events spanning midnight, and events in another time zone:
  shown on each day they cover, in the user's time zone, with "all day" where applicable.
- Calendar invitations not yet accepted: shown with a "tentative" mark.
- Shared or secondary calendars on an account: the user chooses which calendars on the account
  feed the panel; the primary is on by default.
- A message with no subject or no readable preview: shown as "(no subject)" with sender and
  time.
- Account deletion while a refresh is running: the refresh is cancelled first, then credentials
  and cache are wiped and provider access revoked.

## Requirements *(mandatory)*

### Functional Requirements

Connections

- **FR-001**: Users MUST be able to connect a mail account and a calendar account from each
  supported provider through the provider's own consent screen, granting Desk only the access
  each panel needs, and MUST see exactly what was granted before finishing. Connector scopes are
  requested only in a separate per-connection consent and are never added to the sign-in grant,
  which stays `openid email profile`. If the user declines consent, no account is created and
  Settings says consent was declined. If the user grants only some of the requested scopes, the
  account is created with only the capabilities those scopes allow, and the confirmation lists
  what was granted and what was not.
- **FR-002**: The dedicated providers for the first release are exactly Google (mail and
  calendar) and Microsoft (mail and calendar); every other provider connects through the
  standards-based form. Yahoo and any other provider that supports the
  open mail and calendar standards MUST be connectable through a standards-based form with an
  app-specific password. Google mail MUST NOT be offered to users until Google's external
  security assessment for restricted scopes has been passed; until then the Google connect
  screen offers calendar only and says why.
- **FR-003**: Provider credentials MUST be stored encrypted (AES-256-GCM through the platform's
  `SecretBox`, per the constitution's security baseline) and never shown again after
  connection. On disconnect and on account deletion Desk MUST destroy the stored credential
  and MUST attempt revocation at the provider where the provider offers it (Google); where it
  does not (Microsoft, standards-based), Desk MUST tell the user how to remove its access in
  the provider's own settings. A failed revocation attempt is recorded in the audit log and
  MUST NOT prevent the disconnect or deletion from completing.
- **FR-004**: Each connected account MUST have a user-editable label and colour, a status
  (connected, reconnect needed, paused, error), a last-refresh time and the last error, all
  visible in Settings. "Paused" is set and cleared only by the user; it overlays the other
  statuses rather than replacing them, so resuming returns the account to the status it had. "Reconnect needed" is set
  when the provider rejects the credential and cleared by a successful reconnect. "Error" is
  set after twenty consecutive failed refreshes, stops scheduled refreshes, and is cleared by a
  successful reconnect or a successful user-triggered refresh. Until an account reaches "error",
  failed refreshes show only as the stale mark with the last-refresh time. The colour is chosen
  from a fixed palette of eight, assigned in connection order by default; every palette colour
  meets WCAG 1.4.11 non-text contrast (3:1) against the panel background in both themes, and the
  label is always shown beside it, so colour is never the only cue. A user MAY connect at most
  ten accounts (paused accounts count) through any connect route (OAuth or standards-based); the
  eleventh connect attempt is refused with a message naming the limit, and the connect buttons
  are disabled at the limit.
- **FR-005**: Every connected account and every cached item MUST belong to exactly one user and
  MUST be invisible to every other user on every screen and request.

Calendar panel

- **FR-006**: Both panels live on a "Today" page reachable from the main navigation; the
  expenses month view MUST NOT load mail or calendar data. The calendar panel shows seven
  display days, today to today plus six in the user's time zone, and MUST list on each display
  day every event from every connected, unpaused calendar that covers any part of that day
  (including events that started before today), ordered all-day first then by start time, with
  equal start times ordered by account label and then title (all-day events keep their calendar
  date whatever the calendar's or the user's time zone),
  showing title, start and end time in the user's time zone or "all day", location, tentative
  mark, and the account label and colour, with a link that opens the event in the provider.
  Desk keeps cached occurrences from yesterday to today plus seven so day boundaries in any
  zone are covered; declined invitations are not shown.
- **FR-007**: Users MUST be able to choose which calendars on an account feed the panel; the
  account's primary calendar is included by default.
- **FR-008**: For a user active in the last 24 hours, changes made in the provider (events and
  mail alike) MUST be reflected in the panels within five minutes; for other users, within one hour. Opening the
  Today page MUST trigger an immediate refresh when the cached data is older than two minutes,
  with the panels showing the cached data meanwhile. "Active" means the user made any
  authenticated request in the last 24 hours. A refresh requested while one is already queued
  or running for the same account does not start a second; the panel shows the result of the
  running one. User-triggered refreshes (on opening Today, the per-account refresh button) are
  limited to one per user per minute. A limited request is not an error: the panel keeps showing
  cached data with its last-refresh time, and the refresh button says when it can be used again.

Inbox panel

- **FR-009**: The inbox panel MUST show, for every connected, unpaused mail account, the unread
  count and the most recent messages of the inbox folder only (excluding spam, archived and,
  where the provider exposes such sorting, provider-sorted promotional or social mail: Gmail
  categories are excluded, Microsoft's Focused and Other both count as inbox, IMAP has no such
  sorting; fixed cap of fifty per account), newest first
  across accounts, each with sender, subject, one-line preview, received time and account label, and a
  link that opens the message in the provider. The list holds the newest messages whether read
  or unread, each marked read or unread. The one-line preview is at most 200 characters on a
  single line, truncated with an ellipsis. The unread count is the provider's inbox-wide unread
  total where the provider reports one (IMAP `SEARCH UNSEEN`); otherwise it is the number of
  unread messages among the cached fifty. The count of a "reconnect needed" account stays in the
  total, marked as possibly out of date. The panel MUST be read-only: it requests only read
  access from each provider and offers no action on a message other than opening it.
- **FR-010**: _(Merged into FR-008, which now covers mail and events alike; the number is kept
  so references stay stable.)_
- **FR-011**: Users MUST be able to filter the panel to one account.
- **FR-012**: Desk MUST cache only message headers and a preview, never full bodies or
  attachments, MUST discard cached messages once they fall outside the per-account cap, and
  MUST purge every cached message and event of a user who has not visited for 30 days while
  keeping the connection and its credentials, refetching on the next visit. A visit is any
  authenticated request, the same activity signal as FR-008.

Relationship to expenses

- **FR-013**: Beyond the headers and preview FR-012 allows, this feature MUST NOT read message
  bodies or attachments, except that, where a provider offers no preview of its own (standards-based IMAP), Desk MAY
  read at most the first 200 bytes of the text part to build the one-line preview and discards
  the rest; this is stated on the privacy page. It MUST NOT create, suggest or link expenses
  from mail or calendar data, and MUST keep its data separate from the expense tables; the
  panels are presentation only.

States and errors

- **FR-014**: Both panels MUST have loading, empty, stale, reconnect-needed and error states,
  and error copy MUST be specific to the failure (provider unreachable, access revoked, rate
  limited, standards-based login failed). An account is stale when its last successful refresh
  is older than its tier's refresh interval (five minutes for active users, one hour otherwise).
  Each panel has two empty states:
  - no account with that capability connected: explains what connecting does and offers the
    providers
  - accounts connected but nothing to show: "No events in the next seven days" or "No messages
    in your inbox"
- **FR-015**: A refresh that fails MUST leave the previously cached items in place, marked with
  the time of the last successful refresh, and MUST NOT clear a panel because of one failure.
  Cached items are deleted only when a refresh returns the provider's complete window or inbox
  page; an interrupted or partial fetch only adds and updates. When a provider invalidates its
  sync cursor, the forced full refetch is invisible to the user: cached items stay until the
  complete result replaces them.

Privacy

- **FR-016**: The privacy page MUST describe, per provider, what Desk reads, what it stores, for
  how long, and how to revoke access, and the same text MUST appear on the connect screen before
  consent.

Standards-based connections

- **FR-017**: A standards-based connection MUST connect only to public internet hosts: Desk
  resolves the host and refuses loopback, private, link-local, unique-local and
  platform-internal addresses (including Fly's 6PN range) before opening a connection. IMAP MUST
  use TLS on port 993, or port 143 with STARTTLS; CalDAV MUST use `https`. Connection and
  verification attempts MUST be rate-limited per user and per IP. A refused host is reported as
  such, distinct from a failed login.
- **FR-018**: The standards form MUST:
  - offer presets for Yahoo, iCloud and Fastmail that fill the IMAP host, port and CalDAV URL
  - accept mail only (IMAP), calendar only (CalDAV) or both
  - verify only the capabilities requested
  - treat a verified login whose inbox is empty as success

  Reconnecting a standards-based account asks for a new app password, re-verifies it before
  saving, and keeps the cached items. When the provider rejects the stored password, the account
  shows "reconnect needed" with copy explaining that app passwords can be revoked or changed at
  the provider.

Operations and data rights

- **FR-019**: Desk MUST write an audit entry for connect, reconnect, pause, resume, disconnect,
  provider-revocation failure and idle purge, recording user, account, action and time, and
  never credentials or message or event content.
- **FR-020**: The user's data export MUST include every connected account (provider, address,
  label, capabilities, status). It MUST NOT include credentials, or cached messages and events,
  which are a copy of provider data rather than the user's Desk data.
- **FR-021**: The Today page and each provider MUST sit behind feature flags: `panels.today`,
  `panels.google_calendar`, `panels.google_mail`, `panels.microsoft` and `panels.standards`.
  All are off in production until that part's own gate passes. With `panels.today` off, there is
  no navigation entry and no page. A provider whose flags are all off is not offered.
- **FR-022**: A scheduled refresh of one account MUST use at most three provider requests on
  the happy path (cursor-based incremental fetch). Failures back off exponentially from the tier
  interval up to one hour, and a provider's `Retry-After` is always honoured.

Presentation and accessibility

- **FR-023**: Dates and times follow the viewer's locale for 12- or 24-hour clock
  (`Intl.DateTimeFormat`).
  - Day headings read "Today", "Tomorrow", then weekday and date (for example "Wed 30 Sep").
  - A message's received time is shown as the time for today, "Yesterday", then the date.
  - The full date and time are available on hover and to screen readers.
- **FR-024**: The panels MUST be fully operable without a mouse and with a screen reader:
  - The account filter chips are toggle buttons (`aria-pressed`) in the tab order.
  - The colour picker is a radio group operable with arrow keys, with each colour named.
  - Every event and message link has an accessible name that includes its title or subject,
    account and time, and says it opens in a new tab.
  - Panel state changes (loading finished, refresh result) are announced through a polite live
    region.

### Key Entities *(include if feature involves data)*

- **Connected account**: owner user, provider, address, capabilities (mail, calendar), granted
  access, label, colour, status, paused flag, last refresh, last error, encrypted credential.
- **Calendar selection**: per connected account, which of its calendars feed the panel.
- **Cached event**: account, provider event identity, title, start, end, all-day flag, time zone,
  location, tentative flag, link, last seen at.
- **Cached message**: account, provider message identity, sender, subject, preview, received at,
  unread flag, link, last seen at.
- **Refresh state**: per account, cursor or last-sync marker, next due time, consecutive
  failures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user connects a Google or Microsoft calendar or mail account in under two
  minutes. The time runs from clicking "Connect" in Desk to the first items showing in the panel,
  including the time spent on the provider's consent screen. Standards-based providers are
  excluded, because the user may first need to create an app password at the provider.
- **SC-002**: For an active user, an event or message created in the provider appears in the
  panel within five minutes in every trial, with three trials per provider per night over three
  consecutive nights;
  opening Today after a change shows it within ten seconds.
- **SC-003**: The isolation test across every panel and every connection route with two users
  finds zero leaks.
- **SC-004**: Disconnecting an account removes every cached item for it within one minute; in the
  same operation Desk revokes access at providers that support revocation (Google) and, for the
  others, shows the user how to remove Desk's access at the provider (FR-003).
- **SC-005**: With the maximum of ten connected accounts, each at the per-account cap of fifty
  messages plus seven days of events, the Today page renders in under one second on a mid-range
  phone over a mobile connection, defined as Lighthouse's default mobile profile (Moto G Power
  emulation, simulated slow 4G, 4× CPU slowdown) and, in Playwright, the `Pixel 5` device with
  the same network and CPU throttling, and the month view makes no mail or calendar request and keeps
  its existing Lighthouse performance score within two points.
- **SC-006**: Every panel state (loading, empty, stale, reconnect, error) passes the
  accessibility audit with no serious or critical violations at 360 px and desktop width.
- **SC-007**: Three people outside the project each connect at least one account unaided within
  five minutes, together covering at least two different providers (Google, Microsoft or a
  standards-based preset each count as one provider). It passes only if all three succeed; any
  failure is recorded with the step where it happened.

## Assumptions

- **Decision conflict, resolved by the owner on 2026-09-17**: ADR-0001 and CLAUDE.md record
  "Gmail is dropped from the public product (restricted scope → CASA audit)" and "Google
  Calendar is v2". The owner has chosen to include Google mail and accept the assessment. Under
  the constitution (Principle V) an ADR-0004 must record that reversal, the assessment's cost and
  timeline, and update CLAUDE.md before `/speckit-plan` runs.
- The external security assessment for Google restricted scopes is a milestone with its own
  cost and lead time (typically weeks, paid, repeated annually); it needs the product name,
  privacy page and domain from ADR-0002 first. Google mail ships only after it passes; every
  other provider ships before.
- This is a v2 feature scheduled after the Phase 6 cut-over in `docs/ROADMAP.md`; it builds on
  the account, session, connector, encryption and job foundations from Phases 1 to 3.
- Google calendar access is a sensitive scope and needs Google's app verification, which in
  turn needs the product name, privacy page and domain from ADR-0002; those are prerequisites.
- **Blocking dependency, owner Rostom**: ADR-0002's product name, domain and privacy page are
  needed for Google's and Microsoft's production verification and for the CASA assessment.
  Fallback until they are decided: the code ships behind flags. Google and Microsoft stay
  available only to listed test users in the providers' testing modes; in Google's testing
  mode, refresh tokens expire after seven days, so this is for testing only. Standards-based
  connections can ship without them.
- **Needs a spike**: Yahoo mail and calendar are assumed to work through the open standards
  with an app password. Yahoo documents IMAP (`imap.mail.yahoo.com:993`). Yahoo's CalDAV
  endpoint is less documented, and app passwords require two-step verification on the Yahoo
  account. US4's first task (T079) verifies both against a real Yahoo account; if CalDAV fails,
  Yahoo is offered as mail only.
- **Foundations**: the time-zone setting, jobs runner, `SecretBox` and `flags` table are
  shipped (v0.1.3) and present in the repo (checked 2026-09-26). A change to any of them goes
  through its own ADR, and this feature adapts. The only foundation not final is job scheduling
  on Stage 2 (the cut-over). Under the owner's waiver for tasks Phases 1–2, the scheduler is
  built against the `JobRunner` interface only, so it is runtime-neutral.
- Time zone comes from the user's existing setting (Phase 3); events are always displayed in it.
- Cached mail is headers and preview only, capped at fifty messages per account; cached events
  are kept from yesterday to today plus seven (display is today to today plus six, FR-006);
  both are purged after 30 days without a visit.
- Refresh runs through the existing jobs runner: every five minutes per account for users
  active in the last 24 hours, hourly otherwise, plus an on-open refresh; exponential backoff on
  failure up to one hour; status "error" after twenty consecutive failures (FR-004). At most ten
  accounts per user bounds the fan-out.
- English interface only, as for the rest of v1 and v2.
- Out of scope: any action on mail from the panel (mark read, archive, reply, compose),
  calendar editing or event creation, notifications or push alerts, search across mail,
  attachments, message bodies, contacts, any link to expenses, and any shared or team features.
