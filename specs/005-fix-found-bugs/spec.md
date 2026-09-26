# Feature Specification: Fix Found Bugs

**Feature Branch**: `005-fix-found-bugs`

**Created**: 2026-09-26

**Status**: Draft (living — grows after every phase deploy)

**Input**: User description: "Now we will address all the issues and fixes as specs to be done after finishing the current specs, will be called 005-fix-found-bugs, and everytime we finish a phase and deploy it will add the found bugs in this spec, add to it now the one related to notion"

## How this spec works

This is a living specification. It collects the bugs found after a phase is finished and deployed, and it is worked through after the specs currently in flight (001–004) are done. Nothing here is started before then unless Rostom promotes a bug as urgent.

Each time a phase ships and a deploy turns up a defect, the defect is added here as a new entry in the Bug Register below, with its own user stories, functional requirements and success criteria. Entries keep their numbers forever (BUG-001, BUG-002, …); a fixed bug is marked Fixed in the register rather than removed, so the spec doubles as a record of what went wrong and when. Requirement and criterion numbers are prefixed by their bug (FR-001.1, SC-001.1) so adding a bug never renumbers an existing one.

A bug belongs here when it was found on a deployed environment (preview, staging or production) or in a post-deploy check, and it is not already covered by an open task in another spec. A bug fixed on the spot during a deploy (as the promote-production and jobs safety-net failures of 2026-09-26 were) does not need an entry.

## Bug Register

| ID | Title | Found | Where | Severity | Status |
|----|-------|-------|-------|----------|--------|
| BUG-001 | Notion connection fails with "Failed to load Notion connection" | 2026-09-26, after the v0.1.2 deploy | Staging and production | High — the feature is unusable | Open |

### BUG-001 diagnosis (recorded 2026-09-26)

The Connectors page shows the generic toast "Failed to load Notion connection." on both staging and production. Neither deployed app has Notion credentials configured, so the server never enables the Notion feature. A request for the user's Notion connection then falls through to the web app's page fallback and comes back as an HTML page with a success status instead of a data response, which the page cannot read, so it shows its catch-all message. Probed on both apps: the connection request answers with a web page, while a comparable account request answers with a proper "not signed in" data response. No deploy workflow provides Notion credentials to any environment.

Two things are therefore wrong at once: the feature is not configured anywhere (an owner task), and an unconfigured feature fails in a way that looks like a crash instead of saying it is unavailable (a product defect). The connect journey also has gaps that were never exercised because the flow has never run for real: a user who cancels on Notion's consent screen, whose connect attempt expires, who shares no pages, or who later revokes access from inside Notion gets either raw error output or no guidance.

## Clarifications

### Session 2026-09-26

Answers chosen by the agent at Rostom's request ("answer with reasonable answer based on your experience"), checked against Notion's current OAuth documentation.

- Q: Do Notion's access tokens expire, and should the dashboard renew them? → A: Yes — Notion's token response now includes a refresh token; store it encrypted and renew access automatically, treating a connection as "Reconnect needed" only when renewal itself is refused.
- Q: Should Disconnect also revoke the dashboard's access on Notion's side, not just forget it locally? → A: Yes — revoke at Notion (best effort), then forget locally regardless of whether Notion answered.
- Q: How long should a connect attempt stay valid, and can its return link be used more than once? → A: 10 minutes, single use.
- Q: How is a user told their Notion access was lost? → A: In-app only — a "Reconnect needed" status on Connectors and a small indicator on the dashboard; no email.
- Q: What should be recorded when connecting or syncing fails, for diagnosing bugs like this one? → A: A log entry per failed exchange, renewal or refused access, with user id, outcome code and Notion's error code — never a token or its fragment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Honest state when Notion is unavailable (BUG-001, Priority: P1)

A signed-in user opens Settings → Connectors on a server where Notion sync has not been set up. Instead of an error toast, they see a calm explanation that Notion sync isn't available on this server yet, and the Connect action is unavailable, so they are never sent into a flow that cannot work.

**Why this priority**: It is the defect the user sees today on every environment, and it is fixable without any outside setup. It also stops a missing configuration from ever again looking like a crash.

**Independent Test**: On an environment with no Notion credentials, sign in, open Connectors, and confirm the unavailable message appears, Connect is disabled, and no error toast is shown.

**Acceptance Scenarios**:

1. **Given** a server with Notion sync not set up, **When** a signed-in user opens Connectors, **Then** they see "Notion sync isn't available on this server yet" (or equivalent copy), the Connect action is disabled, and no error toast appears.
2. **Given** a server with Notion sync not set up, **When** any Notion-related request is made, **Then** the server answers with a structured "unavailable" response, never a web page.
3. **Given** a server with Notion sync set up and a user who has never connected, **When** they open Connectors, **Then** they see the not-connected state with Connect enabled.

---

### User Story 2 - Connect a Notion workspace end to end (BUG-001, Priority: P1)

A signed-in user clicks Connect Notion, is taken to Notion's own consent screen, signs in to Notion there (the dashboard never sees their Notion password), chooses a workspace and the pages to share, and returns to Connectors showing "Connected to <workspace>". They then pick an existing expenses database or have one created, and sync begins.

**Why this priority**: This is the feature itself; until it works on staging and production, Notion sync does not exist for any user.

**Independent Test**: On staging, with a real Notion account, complete the connect flow from Connectors and confirm the workspace name is shown and a database can be chosen or created.

**Acceptance Scenarios**:

1. **Given** a configured server and a signed-in user, **When** they choose Connect and approve on Notion's consent screen, **Then** they return to Connectors showing the connected workspace's name.
2. **Given** a connected user, **When** they choose Disconnect, **Then** the dashboard forgets their Notion access and shows the not-connected state.
3. **Given** a user who is not signed in to the dashboard, **When** they try to start the connect flow, **Then** they are asked to sign in first and no Notion consent screen is shown.

---

### User Story 3 - Clear outcomes when connecting doesn't finish (BUG-001, Priority: P2)

A user who cancels on Notion's consent screen, whose connect attempt took too long, or whose connect attempt failed lands back on Connectors with a message specific to what happened and a way to try again — never a page of raw error output.

**Why this priority**: Cancelling is a normal choice, and the other failures are rare but currently strand the user on an unreadable page.

**Independent Test**: With a mocked Notion, trigger each of cancel, expired attempt and failed exchange, and confirm each returns to Connectors with its own message and a working "Try again".

**Acceptance Scenarios**:

1. **Given** a user on Notion's consent screen, **When** they cancel, **Then** they return to Connectors with a neutral "Notion wasn't connected" message and no error styling.
2. **Given** a connect attempt older than its allowed window or tampered with, **When** the user returns from Notion, **Then** they see "That connection attempt expired — try again" and nothing is stored.
3. **Given** Notion rejects the connection on the way back, **When** the user returns, **Then** they see "Couldn't connect to Notion — try again" and nothing is stored.
4. **Given** a user who approved but shared no pages, **When** they return, **Then** Connectors explains that no pages were shared and offers to reconnect to choose pages.

---

### User Story 4 - Notice when access is taken away (BUG-001, Priority: P3)

A user who removes the dashboard's access from inside Notion sees, on their next visit to Connectors, that the connection needs reconnecting, and background sync stops retrying against a connection that can no longer work.

**Why this priority**: Less common than the first-connect path, but without it sync fails silently and forever.

**Independent Test**: With a mocked Notion that starts refusing a connected user's access, run a sync and confirm the connection is marked as needing reconnection and no further retries are scheduled.

**Acceptance Scenarios**:

1. **Given** a connected user whose access has merely expired, **When** the next sync runs, **Then** access is renewed silently and sync continues with no change visible to the user.
2. **Given** a connected user whose access Notion now refuses and cannot be renewed, **When** the next sync runs, **Then** the connection is marked "Reconnect needed", sync stops retrying, and the dashboard shows a small reconnect indicator.
3. **Given** a connection marked "Reconnect needed", **When** the user reconnects successfully, **Then** the mark and the indicator clear and sync resumes.

---

### Edge Cases

- A connect attempt returns to the dashboard after the user signed out, or signed in as a different account, in between: nothing is stored and the user sees the expired-attempt message.
- The same connect-return link is replayed: the second use is rejected and nothing changes.
- The user reconnects to a different workspace than before: the new workspace replaces the old connection, and the previously chosen database is cleared so they pick again.
- Notion is down during the connect return: treated as a failed connection (Story 3, scenario 3), not as an expired one.
- A preview environment (one per pull request) cannot receive Notion's return because its address isn't registered with Notion: previews use the mocked Notion; the real round trip is verified on staging only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001.1**: When Notion sync is not set up on a server, every Notion-related request MUST receive a structured "unavailable" response and MUST NOT receive a web page.
- **FR-001.2**: The Connectors page MUST show a distinct "not available on this server" state, with Connect disabled, when the server reports Notion as unavailable; it MUST NOT show the generic error toast in that case.
- **FR-001.3**: Any response the web app cannot read as data MUST surface as a specific, readable error rather than an unexplained failure, so no other feature can repeat this bug's symptom.
- **FR-001.4**: Staging and production MUST each have Notion sync set up whenever their credentials exist, applied by the normal deploy, and MUST start without Notion (in the unavailable state) when they don't.
- **FR-001.5**: Users MUST be able to connect a Notion workspace through Notion's own consent screen, without the dashboard ever receiving their Notion password, and see the connected workspace's name on return.
- **FR-001.6**: A connect attempt MUST be valid for 10 minutes and usable once; the connect flow MUST reject a return that doesn't match an unused attempt started by the same signed-in user within that window, and MUST store nothing in that case.
- **FR-001.7**: Cancelled, expired and failed connect attempts MUST each return the user to Connectors with their own message and a way to try again.
- **FR-001.8**: A connection with no shared pages MUST be explained to the user with an offer to reconnect and choose pages.
- **FR-001.9**: The system MUST keep Notion access renewed automatically; only when renewal is refused MUST it mark the connection "Reconnect needed", stop retrying sync for it, and tell the user in-app only (Connectors status and a dashboard indicator — no email).
- **FR-001.10**: Users MUST be able to disconnect; disconnecting MUST ask Notion to revoke the dashboard's access (best effort) and MUST then remove the stored access locally whether or not Notion answered, after which the dashboard holds no usable Notion access for them.
- **FR-001.11**: Each scenario above MUST be covered by an automated test, and the unavailable-server case MUST have a test that fails against today's behaviour before the fix is written.
- **FR-001.12**: Every failed code exchange, failed renewal and refused access MUST be logged with the user's id, an outcome code and Notion's error code; logs MUST NOT contain any access or renewal credential, whole or partial.

### Key Entities

- **Bug entry**: one row in the Bug Register — ID, title, when and where found, severity, status (Open, In progress, Fixed in <version>) — plus its diagnosis, stories, requirements and criteria in this spec.
- **Notion connection**: a user's link to one Notion workspace — workspace name, chosen expenses database, sync direction, status (connected, reconnect needed, disconnected), last sync time and last error, plus its access and renewal credentials, both stored encrypted. At most one per user.
- **Connect attempt**: a single-use record, valid for 10 minutes, tying an outgoing trip to Notion to the signed-in user who started it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001.1**: On an environment without Notion set up, 0 of 10 visits to Connectors show an error toast; all 10 show the unavailable state.
- **SC-001.2**: On staging, a user with a Notion account goes from clicking Connect to seeing their workspace name in under 1 minute, excluding time spent choosing pages on Notion's screen.
- **SC-001.3**: Every way a connect attempt can end (success, cancel, expired, failed, no pages shared) lands the user on Connectors with a message specific to that outcome — 5 of 5 outcomes, none showing raw error output.
- **SC-001.4**: After access is revoked in Notion, the connection shows "Reconnect needed" within one sync cycle, and no further sync attempts are made for it.
- **SC-001.5**: No request made by the web app returns a web page where data was expected, verified across all routes by an automated check.

## Assumptions

- Rostom creates the Notion public integration (an owner task, since it involves an external account): its name follows the working name "Desk" until ADR-0002 settles the product name, and it needs a logo, a privacy policy and a terms page, which the landing site can host.
- The integration registers exactly two return addresses, staging and production. Preview environments rely on the mocked Notion, as the e2e-ci suite already does.
- Submitting the integration for Notion's public review is out of scope; it only affects a listing in Notion's integration gallery, not whether users can connect.
- Notion's OAuth flow (checked 2026-09-26) returns a refresh token alongside the access token, offers a token-revocation endpoint, and reports a cancelled consent as `error=access_denied` on the return. Connections made before this fix stored no refresh token; they keep working until access is refused, then follow Story 4's reconnect path.
- The Notion sync behaviour itself (two-way sync, database schema, conflict handling from spec 001) is unchanged; only connecting, disconnecting, availability and failure reporting are in scope for BUG-001.
- Work on this spec starts after specs 001–004 are finished, per Rostom's instruction of 2026-09-26.
