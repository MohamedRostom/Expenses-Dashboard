# Feature Specification: Phased Product Baseline

**Feature Branch**: `001-phased-product-baseline` (spec directory; delivery happens on the
`phase-N/...` branches named in `docs/ROADMAP.md`)

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Create baseline specification for each phase and do a deep search
what may enhance this web application"

This document is the product baseline for Desk (working name): what a user can do at the end of
each roadmap phase, how it is verified, and which enhancements found in research are worth
folding into a phase. It says nothing about how the product is built; `docs/adr/ADR-0001` and
the constitution cover that. Phases 0 and 6 have no user-facing behaviour of their own and are
covered under Assumptions and Success Criteria.

## Clarifications

### Session 2026-09-16

- Q: How are duplicate rows detected when a file is imported? → A: By an id column when the user maps one; otherwise by a fingerprint of date, amount, currency and description; matches are reported and skipped.
- Q: How does a user recover a forgotten password? → A: Emailed single-use reset link valid for 20 minutes; a successful reset signs out every other session.
- Q: What scale should the product be designed and tested for? → A: 1,000 users in the beta, up to 20,000 expenses and five years of history per user, month view under one second at that size.
- Q: Which language and number/date formats does v1 support? → A: English interface only; dates and numbers follow the user's browser locale; every amount shows its ISO currency code.
- Q: What availability and recovery targets apply during the beta? → A: 99.5 % monthly availability; nightly backups so at most 24 hours of data can be lost; restore completed within four hours.

### Session 2026-09-16 (checklist resolution, defaults chosen by the agent at the owner's request)

- Q: How is a same-currency expense recorded? → A: Rate 1, rate date equals the expense date, source "none".
- Q: What happens to category budgets when the default currency changes? → A: Converted once at the rate of the change date, rounded to whole major units, and the user is prompted to review them.
- Q: Which rounding rule applies to converted amounts? → A: Round half to even on the minor unit.
- Q: How far back does the previous-published-rate fallback look? → A: Up to seven calendar days; beyond that the conversion is pending.
- Q: What does reversing a rate override do? → A: Restores the fetched rate, which is retained alongside the override.
- Q: How is the duplicate fingerprint normalised? → A: Description lowercased, trimmed, punctuation removed, whitespace collapsed; combined with date, minor amount and currency.
- Q: What are the import file limits? → A: UTF-8 (BOM tolerated), comma, semicolon or tab delimiter auto-detected, first row a header, at most 5 MB and 10,000 rows.
- Q: How are pending conversions treated in totals? → A: Excluded from month and year totals, with a visible count of pending rows.
- Q: Are zero and future-dated amounts allowed? → A: Zero is rejected; dates up to one year ahead are allowed; past dates are unlimited.
- Q: What are the password and sign-in limits? → A: Passwords 12 to 128 characters and not in a known-breached list; 10 attempts per email per 15 minutes and 100 per address per hour, then a 15-minute lockout.
- Q: How long do sessions and unverified accounts live? → A: Sessions expire after 30 days idle or 90 days absolute; unverified accounts are deleted after 7 days.
- Q: What if a Google sign-in email matches a password account? → A: Linked automatically only when Google reports the email verified; otherwise refused with a message to sign in with the password first.
- Q: What does the export contain? → A: Profile, categories with budgets, all expenses including binned ones with their conversion fields, import batches and connection status; never secrets.
- Q: Who administers feature flags? → A: The operator, per user or as a global default; there is no user-facing switch.
- Q: What is the Notion table layout and field mapping? → A: The layout and mapping table now in FR-014; extra Notion properties are ignored; a table missing a required property is offered a fix.
- Q: What happens on first sync and on direction change? → A: Existing Notion rows are imported when Notion is a source; direction changes take effect at the next sync; switching to both runs a full reconcile.
- Q: How are conflicts timed? → A: Server time for Desk edits, Notion's last-edited time for Notion edits, ties go to Desk; both versions kept for 12 months.
- Q: What is the offline queue's scope? → A: Adds only; queued rows show a pending badge and are included in local totals marked as estimated.
- Q: What is the forecast formula? → A: Spend to date plus fixed-kind budgets not yet incurred plus average daily variable spend times days remaining; the basis text names all three.
- Q: Which accessibility standard and viewport apply? → A: WCAG 2.2 AA, no serious or critical automated violations, minimum viewport 360 px.
- Q: How are outages detected and rollback handled? → A: Health checked every minute, owner alerted after three consecutive failures; cut-over rollback returns traffic to the old service within one hour; the old service is read-only during the fallback period.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Own an isolated account in my currency (Priority: P1, Phase 1)

A stranger arrives at the service, creates an account with email and password or with their
Google account, verifies their email, picks the currency they think in, and lands in an empty
workspace that only they can see. They can sign in from two devices, sign one out, change their
default currency and theme, export everything they own, and delete the account outright.

**Why this priority**: nothing else can be trusted until users exist, are isolated from each
other, and have a currency for every later number to be expressed in.

**Independent Test**: register two users in separate browsers, add nothing, and prove that every
screen and every data request of user A returns nothing belonging to user B; delete user A and
prove nothing of theirs remains.

**Acceptance Scenarios**:

1. **Given** a visitor with a valid email, **When** they register and follow the verification
   link, **Then** they can sign in and see an empty workspace labelled with their chosen currency.
2. **Given** a user signed in on two devices, **When** they sign out on one, **Then** the other
   session keeps working and the signed-out device must sign in again.
3. **Given** a user with data, **When** they request an export, **Then** they receive a single
   machine-readable file containing every expense, category, budget and setting they own.
4. **Given** a user with data and a connected integration, **When** they delete their account,
   **Then** all their rows and integration credentials are gone immediately, rows previously
   written to Notion stay in Notion untouched, and the email can register again at once.
5. **Given** repeated failed sign-in attempts, **When** the limit is exceeded, **Then** further
   attempts are refused for a cooling-off period and the user is told why.
6. **Given** a user who forgot their password, **When** they request a reset, **Then** they
   receive a single-use link valid for 20 minutes, setting a new password signs out every other
   session, and using the link a second time fails.
7. **Given** an expired or already-used verification or reset link, **When** it is opened,
   **Then** the page says so and offers to send a new one.
8. **Given** a user with both a password and a linked Google account, **When** they remove one
   sign-in method, **Then** the removal succeeds only while the other method remains.

---

### User Story 2 - Add, see and understand expenses in any currency (Priority: P1, Phase 2)

A user records what they spent (what, how much, in which currency, when, category, how they
paid, fixed/variable/one-off, notes). Amounts in a foreign currency are converted at the rate for
the expense date and shown alongside the original. The month view shows totals, spend per
category against budget, and the list of entries; the user can switch months, edit, delete and
restore, and override a conversion rate on a single expense when they know the real rate.

**Why this priority**: this is the product's core loop; every later feature feeds it.

**Independent Test**: on a GBP account, add one GBP, one EUR and one EGP expense dated on a
weekday and one dated on a Sunday, and check that the month total equals the sum of the
converted amounts, that each row still shows its original amount, and that the Sunday row shows
which published rate date was used.

**Acceptance Scenarios**:

1. **Given** a GBP account, **When** the user adds "Lunch, 12.50 EUR, 2026-09-10", **Then** the
   row shows 12.50 EUR, the converted GBP amount, the rate and the rate date, and the month total
   includes the converted amount.
2. **Given** an expense dated on a weekend or bank holiday, **When** it is saved, **Then** the
   conversion uses the previous published rate and the row states that date.
3. **Given** an expense with a converted amount, **When** the user overrides the rate,
   **Then** the converted amount changes, the row is marked as overridden, and totals update.
4. **Given** a user changes their default currency, **When** the change completes, **Then** every
   existing expense shows a converted amount in the new currency derived from its original amount
   and its own date, category budgets are converted once at the change-date rate and flagged for
   review, and the user sees a percentage of rows processed that updates at least every two
   seconds until 100 % or a failure message with a retry.
5. **Given** an expense is deleted, **When** the user opens the bin within 30 days, **Then** they
   can restore it unchanged; after 30 days it is gone.
6. **Given** the month view, **When** the user presses the keyboard shortcuts for "new expense"
   and "previous/next month", **Then** the form opens and the month changes without the mouse.

---

### User Story 3 - Budget by category and watch the month (Priority: P2, Phase 2)

Each category has an optional monthly budget in the user's default currency. The month view
shows, per category, spend against budget with a clear over-budget state, plus three headline
tiles (spent, budgeted, remaining) and a month-over-month trend.

**Why this priority**: budgets turn a ledger into a tool for decisions; they depend on Story 2.

**Independent Test**: set a 100 GBP budget on Groceries, add 80 GBP then 30 GBP of groceries,
and check that the bar crosses into the over-budget state at the second entry and that the
remaining tile goes negative.

**Acceptance Scenarios**:

1. **Given** a category with a budget, **When** spend in the current month exceeds it, **Then**
   the category is visibly marked over budget in the month view and the table view says so too.
2. **Given** categories seeded by default, **When** the user renames, recolours or deletes one,
   **Then** existing expenses keep their category or are moved to "Other" on deletion.

---

### User Story 4 - Bring in history from a file (Priority: P2, Phase 2)

A user uploads a spreadsheet export from any bank or tool, maps its columns once,
previews how rows will be interpreted, fixes or skips bad rows, and imports without creating
duplicates when the same file is uploaded twice.

**Why this priority**: an empty tracker is abandoned; history makes the month view useful from
day one.

**Independent Test**: import a recorded sample export twice and confirm the row count is
unchanged the second time; import a file with a malformed date and confirm that row is reported
and skipped while the rest import; undo the batch after editing one imported row and confirm all
rows created by the batch, edited ones included, are binned and the count of edited rows is
reported.

**Acceptance Scenarios**:

1. **Given** a spreadsheet export with mapped columns, **When** it is uploaded, **Then** the user sees a preview with
   detected date, amount, currency, description and proposed category per row before confirming.
2. **Given** rows in several currencies, **When** imported, **Then** each keeps its original
   currency and is converted at the rate for its own date.
3. **Given** a file already imported, **When** uploaded again, **Then** rows matching by the mapped
   id column (or, without one, by date, amount, currency and description) are reported
   as duplicates and not created twice.

---

### User Story 5 - Keep a Notion table in step, both ways (Priority: P2, Phase 3)

A user who lives in Notion connects their workspace through Notion's own consent screen, picks an
existing table or lets Desk create one with the known layout, chooses the direction (to Notion,
from Notion, or both), and from then on an expense added on either side appears on the other
within five minutes. Disconnecting leaves data intact in both places.

**Why this priority**: it is the bridge from the owner's current workflow and a differentiator,
but the product is complete without it.

**Independent Test**: with a connected test workspace, add one expense in Desk and one in Notion,
wait five minutes, and confirm both appear on both sides exactly once; edit the same expense on
both sides within a minute and confirm the later edit wins while the earlier version is kept in
the change history.

**Acceptance Scenarios**:

1. **Given** a connected workspace in two-way mode, **When** an expense is created in Desk,
   **Then** it appears in the Notion table within five minutes with the same fields.
2. **Given** a row edited in Notion, **When** the next sync runs, **Then** the Desk expense
   matches the Notion row and the previous Desk version is recorded in the change history.
3. **Given** Notion is rate limiting or unavailable, **When** a sync runs, **Then** no data is
   lost or duplicated, the connector status shows the error, and the next run catches up.
4. **Given** a connected user disconnects, **When** they look at either side, **Then** all rows
   remain, the per-row links are kept, and no further changes flow; reconnecting to the same
   table resumes, reconnecting to a different table starts fresh.
5. **Given** the user revokes access from inside Notion or the token stops working mid-sync,
   **When** the next sync runs, **Then** the connection shows an error asking to reconnect and
   no rows are changed on either side.
6. **Given** a Notion row edited into an invalid state (empty amount, unknown currency),
   **When** a sync runs, **Then** that row is skipped, listed in the connection status with a
   link, and retried on the next sync.

---

### User Story 6 - Capture spending without typing (Priority: P2, Phase 3)

A user gets a personal, secret capture address that accepts a simple "amount, currency, date,
description, optional category" message from a phone automation (a shortcut, an NFC tag, a
notification-reading rule). Received messages become expenses in the message's currency, mapped
to the user's categories through an editable mapping, and the same message delivered twice never
creates two rows. The user can rotate the secret address at any time. Bank-specific capture is
out of v1 (see Assumptions).

**Why this priority**: removes the daily friction that makes trackers die, but depends on
Stories 2 and 3 being solid.

**Independent Test**: send the same recorded message twice to the capture address and confirm
exactly one expense exists with the mapped category; send a message with a foreign currency and
confirm the expense keeps that currency.

**Acceptance Scenarios**:

1. **Given** a valid capture address, **When** a message arrives, **Then** an expense is created
   in the message's currency with the mapped category within one minute.
2. **Given** the same message (same sender-supplied id) is delivered again, **When** processed,
   **Then** no second expense is created.
3. **Given** the user rotates the address, **When** a message is sent to the old one, **Then** it
   is rejected and nothing is created.
4. **Given** a message whose category label has no mapping, **When** it arrives, **Then** the
   expense lands in "Other", the label appears in Settings marked unmapped, and the user can map
   it for next time.
5. **Given** more than 60 messages in a minute to one address, **When** the limit is exceeded,
   **Then** further messages are refused, nothing is queued, and the refusals are counted in the
   audit trail.

---

### User Story 7 - Use it as an app, even offline (Priority: P3, Phase 4)

A user installs Desk on their phone from the browser, opens the add form in two taps from the
home screen, records an expense on a train with no signal, and finds it saved to their account
when the connection returns. Every screen is usable at phone width and every panel shows a
loading, empty or error state rather than a blank space.

**Why this priority**: polish and mobile reach decide whether the beta retains users; it needs
the core loop first.

**Independent Test**: install on a phone, go offline, add an expense, go online, and confirm the
row exists with the date and amount entered; run an accessibility audit on every screen.

**Acceptance Scenarios**:

1. **Given** the app is installed, **When** the user uses the home-screen shortcut, **Then** the
   add form is open and focused within two taps.
2. **Given** no connection, **When** an expense is added, **Then** it is shown as pending,
   counted in local totals marked as estimated, and synced automatically when the connection
   returns with no duplicate because the row carries a client-generated identity.
5. **Given** a queued expense that is rejected once online (unknown currency, deleted category),
   **When** the queue flushes, **Then** the row stays in the queue with the reason and the user
   can fix or discard it.
6. **Given** the session expired while offline, **When** the connection returns, **Then** the
   queue is kept, the user signs in again, and the flush continues.
3. **Given** a first-time user, **When** they sign in, **Then** they are guided through
   choosing a currency, adding a first expense and optionally connecting Notion.
4. **Given** any screen, **When** an automated accessibility audit runs, **Then** no serious
   violations are reported.

---

### User Story 8 - Understand the year, not just the month (Priority: P3, Phase 4)

A user opens a year view with month-by-month totals, drills into a category to see its history,
compares two months, and sees a forecast such as "on track for £X this month" derived from
spend so far and recurring fixed costs.

**Why this priority**: insight is the reason to keep logging; it is only meaningful after months
of data exist.

**Independent Test**: seed twelve months of data and confirm the year totals equal the sum of the
month totals in the default currency and the forecast equals spend to date plus the remaining
fixed-kind budgets.

**Acceptance Scenarios**:

1. **Given** data across several months, **When** the year view opens, **Then** each month's total
   matches its month view total exactly.
2. **Given** the current month is half over, **When** the forecast is shown, **Then** it states
   the three inputs it is based on and updates when a new expense is added.
3. **Given** a month with no fixed-kind budgets or no spend, **When** the forecast is shown,
   **Then** it shows spend to date only and the basis text says which inputs were missing.

---

### User Story 9 - Learn what it is and start without help (Priority: P3, Phase 4)

A stranger reaches the public landing page, understands what Desk does from the name, a few
screenshots and a three-step explanation, reads the privacy and terms pages, and signs up
without asking anyone.

**Why this priority**: required for a public beta; it depends on the product name decision.

**Independent Test**: three people outside the project sign up from the landing page without
assistance and add a first expense.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** it loads on a phone, **Then** the call to action, the
   three steps and the privacy link are visible without horizontal scrolling.

---

### User Story 10 - Trust the service with real money data (Priority: P3, Phases 5 and 6)

During the beta and after the move to production infrastructure, a user experiences the service
as reliable: it is reachable, problems can be reported from inside the app, their data is backed
up and restorable, and when the service moves to new infrastructure nothing changes for them and
nothing is lost.

**Why this priority**: operational trust is what turns testers into users; it needs everything
above to exist first.

**Independent Test**: perform a restore drill from a backup and compare row counts and totals per
user before and after; after the infrastructure move, sign in as a seeded user and confirm every
expense, category, budget and connection is intact.

**Acceptance Scenarios**:

1. **Given** a user inside the app, **When** they submit feedback, **Then** it is recorded with
   their consent and they get an acknowledgement.
2. **Given** a backup taken last night, **When** a restore drill runs, **Then** every user's data
   matches the state at backup time.
3. **Given** the move to production infrastructure, **When** a user signs in afterwards, **Then**
   their data and connections are unchanged and the old service is kept read-only as a fallback
   for 30 days.
4. **Given** a failure discovered after the address change, **When** rollback is triggered,
   **Then** traffic returns to the old service within one hour and no user write is lost because
   the old service was read-only only after the flip was confirmed.

---

### Edge Cases

- An expense dated on a weekend, bank holiday or before the earliest available rate: the most
  recent published rate up to seven days before the expense date is used and the row says which
  date; if none exists, or the provider answers with a date later than requested, the expense is
  saved without a converted amount, excluded from totals, and shown as pending with a retry.
- A currency the rate source does not publish: the expense is saved, stays pending with an
  "unsupported currency" note, and the user may enter a rate manually as an override.
- The default currency changes mid-month: the month view is always shown in the current default
  currency; no month mixes currencies.
- A user changes their default currency while a previous change is still running: the second
  request waits for the first and the user sees a single progress indicator.
- Two devices add the same expense offline with the same client-generated identity: one row
  results when both come online; offline edits and deletes are not queued (FR-018).
- A captured message carries a negative amount (a refund): it creates a negative expense in the
  mapped category so month totals net it off.
- An import file has a mix of date formats, blank amounts, unknown currencies or more decimals
  than the currency allows: the preview marks each affected row as an error and the user can
  fix, skip or abort.
- A Notion row is deleted on one side while edited on the other: the deletion is applied and the
  edit is kept in the change history for recovery.
- The rate provider is unavailable: new expenses in foreign currencies are saved and converted
  when the provider returns; the user sees which rows are waiting.
- A capture address is leaked: the user rotates it; messages to the old address are refused and
  counted so the user can see abuse.
- Account deletion while any background job (sync, currency change) is running: the job is
  cancelled first, the user's rows and credentials are wiped, and no further writes reach Notion.
- A budget for months before a category existed or after it was archived: the budget applies to
  any month; archived categories keep their history but are excluded from the budgeted and
  remaining tiles from the archive date on.

## Requirements *(mandatory)*

### Functional Requirements

Accounts and isolation (Phase 1)

- **FR-001**: Users MUST be able to register with email and password, or with a Google account
  granting only identity and email. An unverified email/password account MAY sign in for its
  first 7 days (Settings shows it as unverified and offers a resend); after that sign-in is
  locked until the address is verified, and an account that never signed in is purged. A failed
  verification send MUST NOT fail sign-up (revised 2026-09-25, previously "MUST verify before
  signing in"). Passwords
  MUST be 12 to 128 characters and MUST be refused when they appear in a known-breached list.
  Unverified accounts MUST be deleted after 7 days; registering the same email again re-sends
  the verification. A Google sign-in whose email matches a password account MUST be linked
  automatically only when Google reports the email as verified, otherwise refused with a message
  to sign in with the password first. Users MUST be able to change their email through a link
  sent to the new address, with a notice to the old one.
- **FR-002**: System MUST keep every user's data invisible and inaccessible to every other user
  on every screen and every request, with no exceptions; a request for another user's resource
  MUST answer "not found", never "forbidden", so that existence is not revealed.
- **FR-003**: Users MUST choose a default currency from the ISO 4217 list at sign-up and be able
  to change it later.
- **FR-004**: Users MUST be able to see active sessions (not expired, not revoked; shown by
  browser, operating system and last-seen time), sign out one device, and have sign-in attempts
  limited to 10 per email per 15 minutes and 100 per network address per hour, after which a
  15-minute lockout applies with the message "Too many attempts, try again in N minutes" that
  never reveals whether the account exists. Sessions MUST expire after 30 days idle or 90 days
  absolute.
- **FR-005**: Users MUST be able to export all their data as one machine-readable file
  containing profile, categories with budgets, every expense including binned ones with their
  conversion fields, import batches and connection status, never secrets. The export MUST be
  produced synchronously as a download. Users MUST be able to delete their account, which ends
  every session, cancels running jobs, wipes every user-owned record (users, sessions, tokens,
  categories, expenses and versions, import data, connections, capture data, flags, feedback)
  and revokes integration credentials, then shows a confirmation screen. Audit records of the
  deletion MUST be kept 12 months with the user identity replaced by a one-way hash. These
  export and deletion rights implement the UK GDPR rights of access and erasure.
- **FR-026**: Users MUST be able to reset a forgotten password through an emailed single-use
  link that expires after 20 minutes; a successful reset MUST sign out all other sessions and the
  request MUST NOT reveal whether the email is registered. Expired or used links MUST show an
  explanation and offer a new link.
- **FR-028**: Every response MUST carry the transport and content-security protections listed in
  the constitution's security baseline (HTTPS only, strict content security policy, HSTS), and
  the theme setting MUST default to "system", following the device preference until the user
  chooses light or dark.

Expenses and currency (Phase 2)

- **FR-006**: Users MUST be able to create, edit, delete and restore (within 30 days) expenses
  with: description, amount, currency, date, category, payment method, kind (fixed, variable,
  one-off) and notes.
- **FR-007**: System MUST store every amount as a whole number of the currency's minor unit
  (pence, cents, fils; zero, two or three decimals per ISO 4217), never as a fractional or
  approximate value; MUST reject a zero amount; MUST keep the original amount and currency
  permanently; and MUST record for each expense the rate used (to ten decimal places), the date
  that rate was published, its source, the converted amount in the default currency and whether
  the rate was overridden. An expense in the default currency records rate 1, rate date equal to
  the expense date and source "none". Dates MUST be accepted up to one year in the future and
  without limit in the past.
- **FR-008**: System MUST convert at the rate for the expense date, rounding half to even on the
  minor unit; on non-trading days MUST use the most recent published rate up to seven days
  earlier and record which date was used; and MUST leave the conversion pending (excluded from
  totals, counted as pending) when no such rate exists, when the source answers with a later
  date, or when the currency is not published by the source.
- **FR-009**: Users MUST be able to override the rate on a single expense; the override MUST be
  visible, the fetched rate MUST be retained, and clearing the override MUST restore it.
- **FR-010**: When the default currency changes, System MUST re-derive every converted amount
  from each expense's original amount and own date, convert category budgets once at the
  change-date rate rounded to whole major units and flag them for review, show a percentage of
  rows processed updated at least every two seconds until done or failed with a retry, queue a
  second change behind a running one, and never alter originals.
- **FR-011**: Users MUST have a seeded set of categories (Rent, Council tax, Utilities,
  Internet, Phone, Subscriptions, Groceries, Eating out, Transport, Cycling, Gym & health,
  Personal care, Clothing, Entertainment, Household, Driving lessons, Travel, Other; the first
  six and Gym & health default to the fixed kind) they can rename, recolour, add to, archive and
  delete, each with an optional monthly budget in the default currency that applies to every
  month; "Other" cannot be deleted; archived categories keep history and leave the budget tiles.
- **FR-012**: The month view MUST show spent, budgeted and remaining totals (remaining equals
  budgeted minus spent and may be negative; categories without a budget count in spent only),
  spend per category against budget with an over-budget state when spent exceeds budget, an
  entries table, a month switcher, a count of rows with pending conversion, keyboard shortcuts
  `n` (new expense), `[` and `]` (previous and next month), and a table alternative for every
  chart. Month and year totals MUST exclude pending rows identically so that a year always
  equals the sum of its months.
- **FR-013**: Users MUST be able to import expenses from any spreadsheet export (UTF-8 with or
  without byte-order mark; comma, semicolon or tab delimiter detected automatically; first row a
  header; at most 5 MB and 10,000 rows) through column mapping, with a preview and per-row error
  reporting. Duplicates MUST be detected by a mapped id column when present, otherwise by
  matching date, minor amount, currency and a normalised description (lowercased, trimmed,
  punctuation removed, whitespace collapsed) against the user's existing expenses, and reported
  rather than created. Undoing an import MUST bin every row the batch created, edited rows
  included, and report how many had been edited.
- **FR-027**: Amounts MUST always display the ISO currency code alongside the number; dates and
  numbers MUST follow the user's browser locale; the interface language is English in v1.

Notion sync and capture (Phase 3)

- **FR-014**: Users MUST be able to connect a Notion workspace through Notion's consent flow,
  pick or create a table with the known layout, choose the sync direction, see status
  (connected, error, disconnected), last sync time and errors, trigger a sync now, and disconnect
  without losing data on either side (per-row links kept; reconnecting to the same table
  resumes, to a different table starts fresh). The known layout is: Expense (title), Amount
  (number), Currency (select), Date, Category (select), Paid with (select: Card, Cash, Bank
  transfer, Other), Kind (select: Fixed, Variable, One-off), Notes, Added via (select:
  Dashboard, Notion, Phone), Expense ID (text). Fields map one to one by that name; extra Notion
  properties are ignored; a table missing a required property is reported as incompatible with
  an offer to add the property. When Notion is a source, rows already in the table are imported
  on the first sync; a direction change takes effect at the next sync, and switching to both
  runs a full reconcile.
- **FR-015**: Two-way sync MUST propagate creates, edits and deletes within five minutes measured
  from save on one side to visibility on the other, resolve conflicts by latest edit (server
  time for Desk edits, Notion's last-edited time for Notion edits, ties to Desk) while keeping
  both versions in a change history visible per expense for 12 months, and never create
  duplicates: a Desk expense and a Notion row are the same item when linked by the stored
  Notion row identity, whatever retries, rate limits or partial failures occur. Rows that fail
  validation are skipped, listed in the connection status and retried next sync; a revoked or
  failing token puts the connection in the error state without changing rows.
- **FR-016**: Each user MUST have exactly one active personal secret capture address that
  accepts amount, currency, description, an optional date (defaulting to today in the user's
  time zone, taken from the browser at sign-up and changeable in Settings), an optional category
  label and an optional sender-supplied id; without an id the message's amount, currency,
  description, date and minute of receipt identify it. Users MUST be able to rotate the address,
  after which messages to the old one are refused; a repeated identity MUST NOT create a second
  expense; more than 60 messages per minute MUST be refused without queueing and counted.
  A received message MUST produce a row within one minute even while its conversion is pending.
- **FR-017**: Category labels in captured messages MUST map to the user's categories through a
  mapping the user can edit, empty at first; unmapped labels go to "Other" and appear in Settings
  marked unmapped; the expense keeps the message's currency.

App experience and insight (Phase 4)

- **FR-018**: The product MUST be installable on phones and tablets running current iOS and
  Android browsers, open the add form focused within two taps starting from an unlocked home
  screen with the app closed, queue expenses added offline (adds only; edits and deletes require
  a connection) with a client-generated identity so they sync without duplicates when back
  online, show queued rows with a pending badge and include them in local totals marked as
  estimated, keep rejected rows in the queue with the reason for the user to fix or discard, and
  keep the queue across an expired session.
- **FR-019**: Every panel (headline tiles, category bars, entries table, year chart, category
  drill-down, connectors, import preview, bin, settings) MUST have loading, empty and error
  states; error messages MUST be distinct for offline, session expired, validation, rate
  unavailable, connector error and server error; and every screen MUST meet WCAG 2.2 AA with no
  serious or critical automated violations at 360 px and at desktop width.
- **FR-020**: Users MUST have a year view, category drill-down, month comparison and a forecast
  for the current month equal to spend to date plus fixed-kind budgets not yet incurred plus the
  average daily variable spend so far times the days remaining, with a basis text naming those
  three inputs and any that were missing.
- **FR-021**: A public landing page MUST explain the product, show a three-step onboarding, link
  privacy and terms in English, and lead to sign-up; it MUST NOT be published under the working
  name, so it waits for the ADR-0002 name decision while everything else proceeds. First sign-in
  MUST guide the user through currency, first expense and optional Notion connection; each step
  can be skipped and the guide resumes on the next sign-in until completed or dismissed.
- **FR-022**: Any capability released before it is announced MUST be switchable by the operator,
  per user or as a global default, without a new release and taking effect on the next request;
  there is no user-facing switch.

Operations (Phases 5 and 6)

- **FR-023**: Users MUST be able to send feedback (up to 2,000 characters, no attachments) from
  inside the app; with consent the page, app version and browser are attached; feedback reaches
  the owner in a daily digest; the widget is disabled offline and explains a rate limit. The
  service MUST publish its health, checked every minute, with the owner alerted after three
  consecutive failures. Error tracking, uptime monitoring and backup storage MAY use third-party
  services chosen in the plan.
- **FR-024**: User data MUST be backed up nightly as a full database copy (at most 24 hours of
  loss), encrypted at rest, retained 30 days; a documented restore MUST complete within four
  hours and MUST be rehearsed at least once before the public beta ends.
- **FR-025**: The move to production infrastructure MUST lose no data, keep the same product
  address for users, keep the previous service available read-only as a fallback for 30 days,
  and allow rollback to it within one hour of a failure being found.

### Key Entities *(include if feature involves data)*

- **User**: identity, verified email, default currency, theme, sessions; owns everything below.
- **Expense**: description, original amount and currency, date, category, payment method, kind,
  notes, conversion record (rate, rate date, source, converted amount, overridden flag), source
  of entry (app, Notion, phone capture, import), deletion timestamp for the bin.
- **Category**: per-user name, colour, kind default, optional monthly budget in default currency.
- **Exchange rate**: base currency, quote currency, published date, value, source; shared by all
  users, never edited.
- **Notion connection**: per-user consent credential (encrypted), chosen table, direction,
  status, last sync, error; plus a per-expense link to its Notion row and a change history.
- **Capture address**: per-user secret, rotation history, received message ids for duplicate
  detection, category-label mapping.
- **Import batch**: file, mapping, per-row outcome, created expenses, and per-row identity (mapped
  id or fingerprint of date, minor amount, currency, normalised description) for undo and
  duplicate detection.
- **Audit record**: who, what, when, for deletions, connector actions and refused capture
  messages; pseudonymised after account deletion and kept 12 months.
- **Feature flag**: named switch with per-user state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (Phase 0): a change to the Hello text merges only after every automated check
  passes and a preview address for that change is posted on the review; the main line deploys to
  the staging address automatically.
- **SC-002** (Phase 1): a stranger completes registration, verification and first sign-in in
  under three minutes from opening the sign-up page to seeing the empty workspace, email reading
  included; the isolation test, covering every route in the API contract and every resource type
  with two users, finds zero leaks.
- **SC-003** (Phase 2): the owner records a full week of real expenses in at least two
  currencies on the staging service without any manual data fix; month totals equal exactly the
  whole-minor-unit sum of the converted amounts of non-pending rows.
- **SC-004** (Phase 2): importing a 1,000-row spreadsheet export completes in under one minute
  with rates already cached, and a second import of the same file creates zero new rows.
- **SC-005** (Phase 3): an expense added on either side appears on the other within five
  minutes in 100 % of trials (three per direction per run) over three consecutive nightly runs; a
  replayed capture message never creates a second row.
- **SC-006** (Phase 4): the app installs on the owner's phone with a two-tap add; performance
  and accessibility audits score at least 90 and 95 respectively on the landing page and the
  app; three people outside the project sign up unaided in observed sessions where no question
  is answered by the team, recorded as pass or fail each.
- **SC-007** (Phase 5): 30 days of public beta at or above 99.5 % monthly availability with no
  data-loss incident; one restore drill completed within four hours.
- **SC-008** (Phase 6): production cut-over with zero data loss verified per user by the sum of
  converted amounts of active rows and by row counts including binned rows, before and after;
  the old service kept 30 days then retired.
- **SC-009** (all phases): a returning user can log an expense on a mid-range phone over a
  mobile connection in under 15 seconds from unlocking the device.
- **SC-010** (Phases 2 to 5): with 1,000 users and a user holding 20,000 expenses across five
  years, the month view and year view each answer in under 500 ms at the 95th percentile and
  render in under one second on a mid-range phone over a mobile connection, and the isolation
  test still finds zero leaks.

## Assumptions

- Phase 0 (already scaffolded as PR #1) has no user-facing behaviour; its outcome is SC-001.
- Phase 6 changes infrastructure only; its user promise is captured in Story 10 and SC-008.
- Working name "Desk" is used until ADR-0002 is accepted; the landing page (Story 9) cannot ship
  before the name exists.
- Money is stored as whole minor units; all conversions use the published rate for the expense
  date from a free central-bank source that publishes on business days for about thirty
  currencies; other currencies stay pending until the user enters a rate; no live intraday
  rates, so every rate-related scenario refers to a published daily rate.
- Deleted expenses are kept 30 days in a bin; account deletion is immediate and irreversible.
- Design and test scale for v1: 1,000 users, 20,000 expenses and five years of history per user.
- v1 is English-only; localisation of the interface is v2, but number and date formatting follows
  the browser locale from day one and amounts always carry their ISO currency code.
- Google sign-in requests only identity and email; calendar and mail are out of scope for v1.
- Notion sync targets the known layout in FR-014 and the current Notion API version with data
  sources and its published request limits, revisited by the owner when Notion changes them;
  Notion's own change notifications (in beta and limited to property changes) are not relied on,
  so every timing requirement assumes periodic checks.
- No bank integration in v1 (decided 2026-09-16, ADR-0003): no bank-specific import formats, no
  bank webhooks, no open-banking feed. Automatic capture is limited to the generic capture
  address; history arrives through column-mapped file import (Story 4).
- Shared or household budgets, receipt attachments, open-banking feeds and calendar panels are
  v2 and appear only in the enhancement backlog.

## Enhancement Candidates (from research)

Found while searching what leading trackers offer in 2026; each is assigned a suggested phase or
parked for v2. None is a requirement until pulled into a phase through an ADR or a later spec.

| Candidate | What users get | Suggested phase | Basis |
|-----------|----------------|-----------------|-------|
| Recurring-expense detection with price-change alerts | Subscriptions surfaced automatically, editable, "committed spend" shown before the month starts | Phase 4 insights | Rocket Money and peers lead with it; users want it transparent and editable |
| Sync status that is quiet by default | A small "changes pending" indicator only when offline edits exist | Phase 4 PWA | Offline-first guidance: show nothing when synced |
| Version history instead of silent overwrite | Every conflict keeps both versions; user can restore | Phase 3 (already implied by latest-edit-wins audit) | Offline-sync guidance warns against lossy last-write-wins |
| Currency detection from free text ("lunch 1500 yen") | Fewer taps on the add form | Phase 4 quick add | Multi-currency trackers now parse currency from input |
| Rate transparency | Each converted figure shows rate, date and source on tap | Phase 2 (extends FR-007) | Best trackers are explicit about which rate and when |
| Phone quick capture via Shortcuts or a share target | Log in under two seconds from lock screen, action button or NFC tag | Phase 4 (generic capture address makes this possible) | Shortcut-based logging is the fastest path in 2026 reviews |
| Household sharing (two users, one category set) | Partners track together | v2 (needs isolation done right first) | Monarch's main draw |
| Receipt photo attachment and OCR | Amount and merchant from a photo | v2 | Standard in business trackers, growing in personal ones |
| Open-banking feed for UK banks | Automatic transactions from any UK bank | v2 (provider decision) | Bank integration is deliberately excluded from v1; a licensed provider is the only public path |
| Notion change notifications | Faster sync than five-minute polling | Phase 3 optional | Notion webhooks exist but are beta and property-only in 2026 |
| Zero-based or envelope budgeting mode | Assign every unit of income | Parked | YNAB/Actual Budget users expect it; different mental model from category budgets |

Sources consulted: [NerdWallet best expense trackers](https://www.nerdwallet.com/finance/learn/best-expense-tracker-apps),
[CNBC expense tracker apps](https://www.cnbc.com/select/best-expense-tracker-apps/),
[Finny multi-currency trackers](https://getfinny.app/blog/best-multi-currency-expense-tracker-2026),
[Lunch Money multi-currency](https://lunchmoney.app/features/multicurrency/),
[Firefly III vs Actual Budget](https://beancount.io/blog/2026/07/26/firefly-iii-vs-actual-budget-self-hosted-open-source-budgeting-guide),
[Offline-first sync conflicts](https://dev.to/crisiscoresystems/sync-conflict-handling-in-offline-first-pwas-how-to-merge-without-lying-to-the-user-59i3),
[Offline-first PWA patterns](https://alamb-hex.github.io/blog/2026/01/21/building-true-offline-first-pwas/),
[Notion webhooks](https://developers.notion.com/reference/webhooks),
[Notion API 2026 guide](https://www.stackscout.net/articles/cc_20260628_173053.html),
[Apple Shortcuts expense logging](https://getfinny.app/blog/apple-shortcuts-expense-tracking-automations-2026),
[Expense tracker feature list 2026](https://ripenapps.com/blog/expense-tracking-app-features/).
