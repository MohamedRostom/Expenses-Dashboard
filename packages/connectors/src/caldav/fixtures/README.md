# CalDAV fixtures

Hand-authored, not recorded against a live server: T079 (the real-Yahoo spike against
`imap.mail.yahoo.com:993` and Yahoo's CalDAV endpoint, owner-only, needs `local-secrets`) has not
run yet, so there is no captured transcript to redact. These fixtures are written directly from
RFC 4791 (CalDAV), RFC 4918 (WebDAV, `PROPFIND`/multistatus), RFC 6578 (`sync-token` semantics) and
RFC 5545 (iCalendar), shaped to match the documented request/response bodies iCloud and Fastmail
publish for `PROPFIND` discovery, `getctag` and the Apple/Fastmail `CALDAV:expand` REPORT
extension. Treat them as a faithful contract fixture, not a golden recording — when T079 lands,
diff its real transcript against these and update both the fixtures and this note.

- `propfind-current-user-principal.xml` — response to `PROPFIND` (Depth 0) on the CalDAV root URL.
- `propfind-calendar-home-set.xml` — response to `PROPFIND` (Depth 0) on the principal href.
- `propfind-calendar-list.xml` — response to `PROPFIND` (Depth 1) on the calendar home; includes
  the home collection itself (not a calendar, must be filtered out), a calendar that only
  supports `VTODO` (must be filtered out), and the one calendar the client should keep.
- `propfind-calendar-ctag.xml` / `propfind-calendar-ctag-changed.xml` — response to `PROPFIND`
  (Depth 0) on a single calendar's URL for `CS:getctag` — same shape, different ctag value, to
  exercise "ctag changed forces a full window fetch" vs "ctag unchanged, skip".
- `report-calendar-query-expand.xml` — `REPORT calendar-query` with `<C:expand>` honoured: a
  recurring event pre-expanded into three `VEVENT`s (one per occurrence, `RECURRENCE-ID`, no
  `RRULE`) across `NEEDS-ACTION`/`TENTATIVE`/`DECLINED` `PARTSTAT`, an all-day two-day event, an
  accepted event, a no-attendees event, and a `TZID`-based event with its `VTIMEZONE`.
- `report-calendar-query-no-expand.xml` — the same kind of window, but the server ignored
  `<C:expand>`: one `VEVENT` with `RRULE:FREQ=WEEKLY;COUNT=5`, an `EXDATE` excluding one
  occurrence, and a `RECURRENCE-ID` override that moves and re-answers one occurrence. Exercises
  the client's local `ical.js` expansion.
- `error-401.xml` — a WebDAV `<D:error>` body returned with HTTP 401 (wrong password).
