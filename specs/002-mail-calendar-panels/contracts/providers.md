# Provider Client Contract

Every provider client in `packages/connectors` implements one or both of these interfaces, ships
a fake that implements the same interfaces, and ships recorded fixtures that both the real client
tests and the fake are validated against. The refresh job talks only to these interfaces.

## Interfaces (`packages/connectors/src/panels`)

```text
CalendarSource
  listCalendars(cred): { id, name, isPrimary, colour? }[]
  fetchWindow(cred, calendarIds, from, to, cursor?):
      { events: EventOccurrence[], cursor?: string, full: boolean }
      // full = true means the result is the complete window and unseen rows may be deleted

MailSource
  fetchInbox(cred, limit, cursor?):
      { messages: MessageHeader[], unreadTotal?: number, cursor?: string, full: boolean }

Common
  verify(cred): void            // throws VerificationError { step } on failure
  revoke(cred): void            // best effort; throws only on network failure
  errors: AuthError (reconnect needed), RateLimited { retryAfterMs }, ProviderError
```

`EventOccurrence`: `{ providerEventId, calendarId, title, startsAt, endsAt, allDay, timeZone?,
location?, tentative, declined, link? }`. `MessageHeader`: `{ providerMessageId, fromName?,
fromAddress, subject, preview (at most 200 chars), receivedAt, unread, link? }`.

## Per-provider mapping

| Provider | Calendar | Mail | Cursor | Verify | Revoke |
|----------|----------|------|--------|--------|--------|
| Google | `events.list` on each enabled calendar, `singleEvents=true`, `timeMin/timeMax`; `attendees[self].responseStatus` maps to tentative or declined | `messages.list` (`labelIds=INBOX`, `q=-category:promotions -category:social`) then `messages.get?format=metadata` (From, Subject, Date, snippet) | `syncToken` per calendar; `historyId` for mail; `410` invalidates and forces a full fetch | token refresh plus `calendarList.list` or `getProfile` | `https://oauth2.googleapis.com/revoke` |
| Microsoft | `/me/calendarView` per enabled calendar with `Prefer: outlook.timezone="UTC"`; `responseStatus.response` maps to tentative or declined | `/me/mailFolders/inbox/messages/delta` with `$select` and `$top=50` | `@odata.deltaLink`; `410` or `syncStateNotFound` forces a full fetch | token refresh plus `/me` | none exposed; the row is deleted and the user is told how to remove the app from their account |
| Standards (CalDAV) | `PROPFIND` discovery; `REPORT calendar-query` with `expand`; `ical.js` parsing; local expansion when the server ignores `expand`; `PARTSTAT` maps to tentative or declined | not applicable | `sync-token` or `getctag`; change forces a full window fetch | `PROPFIND` on the calendar home | none; credential deleted |
| Standards (IMAP) | not applicable | `LOGIN`, `SELECT INBOX`, `SEARCH UNSEEN` for `unreadTotal`, `UID SEARCH ALL` newest fifty, `UID FETCH` flags, internal date, header fields From, Subject, Date, and the first 200 bytes of text for the preview; one connection per refresh, closed with `LOGOUT` | `UIDVALIDITY:UIDNEXT`; a changed `UIDVALIDITY` forces a full fetch | `LOGIN` plus `SELECT INBOX` | none; credential deleted |

## Fixture and fake rules

- Each provider folder has `fixtures/` with recorded responses (redacted addresses and ids) for:
  first full fetch, incremental fetch with one new item, invalid cursor, revoked credential,
  rate limited, and, for calendars, a recurring event and an all-day multi-day event.
- The fake replays the fixtures and accepts scripted mutations (add message, add event, revoke)
  so scenario tests and the mocks container can drive it.
- A contract test per provider runs the real client against the fixtures over an HTTP stub (or
  the scripted IMAP server) and the fake against the same fixtures, asserting identical
  `EventOccurrence` and `MessageHeader` output.
- The IMAP scripted server implements exactly the command subset above, in
  `packages/connectors/src/imap/fake-server.ts`, and is what `infra/mocks` exposes on a port for
  e2e-ci.
