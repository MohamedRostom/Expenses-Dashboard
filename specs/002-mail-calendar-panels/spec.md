# Feature Specification: Mail and Calendar Panels

**Feature Branch**: `002-mail-calendar-panels` (spec directory; delivery branch to be named when
the feature is scheduled)

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "create a new spec baseline for the new feature in the dashboard to
represent the person mails, calender after integrating with multiple platforms like google,
yahoo, outlook, ..etc"

Desk users connect one or more personal mail and calendar accounts from different providers and
see, on a new "Today" page in the dashboard, what is coming up and what has arrived: a "next
days" calendar panel and an inbox panel, both across every connected account. The expenses
month view is unchanged. This brings the two panels of the
owner's personal dashboard (see CLAUDE.md, "Personal dashboard artifact") to every Desk user.

This spec reopens two recorded decisions and cannot proceed to planning until an ADR
(`docs/adr/ADR-0004`) accepts the change: ADR-0001 dropped mail from the public product because
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

**Independent Test**: connect a Microsoft mailbox and a Yahoo mailbox in a test account, send
each one a message, and confirm both appear in the panel within five minutes newest first;
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
its colour, pause it, reconnect it when the provider revokes access, and disconnect it, which
removes everything Desk cached from that account.

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
   connected account's credentials and cached data are gone and access is revoked at each
   provider.

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
  time of its last refresh, and refresh retries with backoff; no error is shown for a single
  missed refresh.
- Mailbox with tens of thousands of messages: only the most recent messages (a fixed cap) are
  ever fetched or cached; the panel never claims to be a complete mailbox.
- The same address connected twice (once for mail, once for calendar): shown as one account with
  both capabilities, not two.
- Two accounts share a display name: labels are editable and default to the address.
- An eleventh account: the connect button is disabled with the limit shown; disconnecting one
  re-enables it.
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
  each panel needs, and MUST see exactly what was granted before finishing.
- **FR-002**: Supported dedicated providers for the first release MUST include Google (mail and
  calendar) and Microsoft (mail and calendar). Yahoo and any other provider that supports the
  open mail and calendar standards MUST be connectable through a standards-based form with an
  app-specific password. Google mail MUST NOT be offered to users until Google's external
  security assessment for restricted scopes has been passed; until then the Google connect
  screen offers calendar only and says why.
- **FR-003**: Provider credentials MUST be stored encrypted and never shown again after
  connection. On disconnect and on account deletion Desk MUST destroy the stored credential
  and MUST attempt revocation at the provider where the provider offers it (Google); where it
  does not (Microsoft, standards-based), Desk MUST tell the user how to remove its access in
  the provider's own settings. A failed revocation attempt is recorded in the audit log and
  MUST NOT prevent the disconnect or deletion from completing.
- **FR-004**: Each connected account MUST have a user-editable label and colour, a status
  (connected, reconnect needed, paused, error), a last-refresh time and the last error, all
  visible in Settings. "Paused" is set and cleared only by the user. "Reconnect needed" is set
  when the provider rejects the credential and cleared by a successful reconnect. "Error" is
  set after twenty consecutive failed refreshes, stops scheduled refreshes, and is cleared by a
  successful reconnect or a successful user-triggered refresh. A user MAY connect at most ten
  accounts (paused accounts count); the eleventh connect attempt is refused with a message
  naming the limit.
- **FR-005**: Every connected account and every cached item MUST belong to exactly one user and
  MUST be invisible to every other user on every screen and request.

Calendar panel

- **FR-006**: Both panels live on a "Today" page reachable from the main navigation; the
  expenses month view MUST NOT load mail or calendar data. The calendar panel shows seven
  display days, today to today plus six in the user's time zone, and MUST list on each display
  day every event from every connected, unpaused calendar that covers any part of that day
  (including events that started before today), ordered all-day first then by start time,
  showing title, start and end time in the user's time zone or "all day", location, tentative
  mark, and the account label and colour, with a link that opens the event in the provider.
  Desk keeps cached occurrences from yesterday to today plus seven so day boundaries in any
  zone are covered; declined invitations are not shown.
- **FR-007**: Users MUST be able to choose which calendars on an account feed the panel; the
  account's primary calendar is included by default.
- **FR-008**: For a user active in the last 24 hours, changes made in the provider MUST be
  reflected in the panel within five minutes; for other users, within one hour. Opening the
  Today page MUST trigger an immediate refresh when the cached data is older than two minutes,
  with the panels showing the cached data meanwhile.

Inbox panel

- **FR-009**: The inbox panel MUST show, for every connected, unpaused mail account, the unread
  count and the most recent messages of the inbox folder only (excluding spam, archived and
  provider-sorted promotional or social mail; fixed cap per account, default fifty), newest first
  across accounts, each with sender, subject, one-line preview, received time and account label, and a
  link that opens the message in the provider. The panel MUST be read-only: it requests only
  read access from each provider and offers no action on a message other than opening it.
- **FR-010**: New mail MUST appear in the panel within the refresh window of FR-008 (five
  minutes for active users, one hour otherwise, immediately on opening Today).
- **FR-011**: Users MUST be able to filter the panel to one account.
- **FR-012**: Desk MUST cache only message headers and a preview, never full bodies or
  attachments, MUST discard cached messages once they fall outside the per-account cap, and
  MUST purge every cached message and event of a user who has not visited for 30 days while
  keeping the connection and its credentials, refetching on the next visit.

Relationship to expenses

- **FR-013**: This feature MUST NOT read message bodies or attachments, MUST NOT create,
  suggest or link expenses from mail or calendar data, and MUST keep its data separate from the
  expense tables; the panels are presentation only.

States and errors

- **FR-014**: Both panels MUST have loading, empty, stale, reconnect-needed and error states,
  and error copy MUST be specific to the failure (provider unreachable, access revoked, rate
  limited, standards-based login failed).
- **FR-015**: A refresh that fails MUST leave the previously cached items in place, marked with
  the time of the last successful refresh, and MUST NOT clear a panel because of one failure.

Privacy

- **FR-016**: The privacy page MUST describe, per provider, what Desk reads, what it stores, for
  how long, and how to revoke access, and the same text MUST appear on the connect screen before
  consent.

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

- **SC-001**: A user connects a mainstream calendar or mail account in under two minutes from
  clicking "connect" to seeing their first items in the panel.
- **SC-002**: For an active user, an event or message created in the provider appears in the
  panel within five minutes in 95 % of trials over three consecutive nightly runs per provider;
  opening Today after a change shows it within ten seconds.
- **SC-003**: The isolation test across every panel and every connection route with two users
  finds zero leaks.
- **SC-004**: Disconnecting an account removes every cached item for it within one minute and
  provider access is revoked in the same operation.
- **SC-005**: With the maximum of ten connected accounts, each at the per-account cap of fifty
  messages plus seven days of events, the Today page renders in under one second on a mid-range
  phone over a mobile connection, and the month view's own timing is unchanged.
- **SC-006**: Every panel state (loading, empty, stale, reconnect, error) passes the
  accessibility audit with no serious or critical violations at 360 px and desktop width.
- **SC-007**: Three people outside the project connect an account from at least two different
  providers unaided.

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
- Yahoo mail and calendar are reachable through the open standards with an app password rather
  than a dedicated integration.
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
