# Microsoft Graph mail fixtures

Hand-authored from Microsoft Graph's documented response shapes for
`GET /v1.0/me/mailFolders/inbox/messages/delta` (Microsoft Graph REST v1.0 reference and the
`delta` query documentation) — not recorded from a real tenant, since this workspace has no
Microsoft 365 test account to record against. Field names, `@odata.nextLink`/`@odata.deltaLink`
pagination, the `@removed` tombstone shape, and the `401`/`429`/`syncStateNotFound` error bodies
follow the documented shapes as of the plan's research date (2026-09-17); the `syncStateNotFound`
error code's exact casing is copied from the sibling `calendar/error-syncStateNotFound.json`
fixture (also hand-authored) for consistency within this repo and should be reconciled with a real
`410`/`400` response the first time a real tenant is available (see research.md R2, R10).

- `messages-full-page1.json` / `messages-full-page2.json`: first full fetch, two pages joined by
  `@odata.nextLink`; the final page carries `@odata.deltaLink`. `msg-1`'s `bodyPreview` is over 200
  characters to exercise preview truncation; `msg-3` has no `from.emailAddress.name` to exercise
  the optional `fromName`.
- `messages-delta.json`: incremental fetch from the stored `deltaLink` — one new message plus one
  `@removed` tombstone.
- `error-syncStateNotFound.json`: the `410`/`400` "start over" response that forces a full refetch.
- `error-401.json`, `error-429.json`: auth and throttling error bodies (`Retry-After` is asserted
  from the response header in the test, not the body).
