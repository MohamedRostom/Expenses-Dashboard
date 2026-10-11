# Changelog

All notable changes to this project are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Unreleased changes sit at the top until a tag is cut.

## [Unreleased]

### Added

- docs: the accent is one at a time, Signal Green by default, user-selectable from the presets: DESIGN.md "One Signal Rule", ADR-0006 addendum, constitution Principle VI wording and Sync Impact Report, CLAUDE.md, roadmap (spec 004 T061).
- Accent colour picker in Settings (six presets, applied at once and kept on the account), behind the `appearance.accent` flag (spec 004 T056, T060).
- Refresh: widgets (strip, frames, add and settings sheets) on the Concourse Board identity; the widget frame now lives in the web app (spec 004 T042).
- Refresh: year, import and bin screens on the Concourse Board identity; the month comparison sits on a panel frame and the import preview is a board (spec 004 T040).
- Refresh: Today (calendar and inbox) on the Concourse Board identity (spec 004 T037).
- Refresh: sign-in on the Concourse Board identity, with an error message per cause (spec 004 T036).
- Refresh: register, verify, forgot, reset and onboarding on the Concourse Board identity, each in a main landmark (spec 004 T039).
- Refresh: capture, Notion connector and connected-accounts screens on the Concourse Board identity, each in a main landmark, with real 44px targets and no accent-coloured text (spec 004 T041).
- Refresh: settings on the Concourse Board identity, with a page margin and a main landmark (spec 004 T035).
- Refresh: categories and budget editor on the Concourse Board identity; the first default category colour no longer matches the over-budget red (spec 004 T034).
- Refresh: landing page on the Concourse Board identity (tokens only, three steps above the fold at 360 wide, light and dark screenshots switched by `prefers-color-scheme`); `screenshots.spec.ts` generates them, and the drift list no longer carries the landing files (spec 004 T048-T051).
- Refresh: month view on the Concourse Board identity; category rows no longer print the currency twice; no sideways scroll at 360 wide (spec 004 T032).
- Refresh: header, navigation and feedback button on the Concourse Board identity (spec 004 T031).
- Refresh: add-expense sheet and form on the Concourse Board identity; the date field shows a visible focus ring (spec 004 T033).
- Refresh: feedback form fields, header rule, button loading width and toast motion finished on the Concourse Board identity (spec 004 T031 review fixes).
- docs: contributor exercise run by the agent (a throw-away DemoPanel built from DESIGN.md §Building a new panel alone, then deleted); the section is corrected where it did not match PanelFrame (it has no slot for loaded content) and records the agent timing. SC-006, timed by a person, stays `needs-rostom` (T047).
- docs: DESIGN.md "Building a new panel" is a finished walkthrough (PanelFrame, the three states, figures, layout-only CSS, new-block story, checks), with a test that it is no longer a stub (T046).
- ui: every catalogue story has a `usage` example, rendered at `/__ui` as a live cell per theme plus its source, under a new index of all blocks with their purpose; Dialog and Toast get an `inline` mode so they render in the catalogue, Skeleton gains a `row` shape and DataTable a `loading` state (skeleton rows, `aria-busy`), the dark column no longer occludes wide blocks at 360px (columns stack), and unbuilt `compact`/`inline`/Dialog `loading` entries are dropped from contracts/blocks.md (T045).
- e2e: visual tests for catalogue usage examples (live cell per theme, source block, index links, inline Dialog/Toast, DataTable 360px layout), red until the catalogue renders them in T045 (T044).
- ui: block-inventory test in `tokens.test.ts` (every block in contracts/blocks.md has a component and a story whose title, purpose, variants and states match; usage strings still pending until T045) and a required `purpose` on every story (T043).
- accent: `users.accent` column (six preset ids, CHECK-constrained, default `signal-green`), `accent` on the user contract and `PATCH /me`, and the `appearance.accent` flag (off); UI to follow (spec 004 T057).
- accent: `PATCH /me` stores the chosen accent preset and `GET /me` and the export return it (spec 004 T055, T058).
- accent presets: five `data-accent` palettes (Concourse Blue, Platform Teal, Violet, Slate, Plum) in tokens.css with contrast tests in light, system dark and explicit dark, and an `AccentPresets` catalogue row (spec 004 T054, T059).
- ui: Concourse Board identity (ADR-0006) is now the shipped token set; proposed-tokens, the data-identity wrapper and the fallback mock-up are gone (T028).
- UI refresh direction, mock-ups round two (spec 004 T027a, dev and preview only): Today (`/__ui/mockups/today`) and widgets (`/__ui/mockups/widgets`, every widget in every state plus both sheets) mock-ups; every proposed mock-up is now interactive over fixtures (switch month, add and remove an expense with undo, add, remove and reorder widgets by drag or keyboard, theme toggle), plays simulated live data unless `?live=off`, lays out fluidly with container queries, and moves at DESIGN.md's raised motion intensity (settle-in, list glide, bar growth on a month change, hover lift), all under 280 ms and off under reduced motion.
- UI refresh direction, mock-ups (spec 004 T027, dev and preview only, not in the production bundle): coded mock-ups of the month view, add-expense sheet and settings in the proposed Concourse Board identity, plus the month view in the refined incumbent identity, at `/__ui/mockups/*` with loading, empty, error and edge states and the arrival-flip demo; "before" screenshots of the shipped screens in `docs/design/before/`. The Feedback button no longer shows on `/__ui` routes.
- Mail and calendar panels, foundation (spec 002 Slice A, all behind `panels.*` flags that are off in production): connected-accounts schema with the five `panels.*` flag rows seeded by migration, Google and Microsoft OAuth connect flow (read-only scopes, address taken from the provider's id_token, ten-account limit), a refresh job and per-minute scheduler with backoff, `GET /panels/today` and rate-limited refresh routes, and dark Today and Connections pages with loading, error and empty states.
- Mail and calendar panels, calendar (spec 002 Slice B, US1, behind `panels.google_calendar` and `panels.microsoft`): Google Calendar `events.list` and Microsoft Graph `calendarView` clients, the seven-day `CalendarPanel` with account chips, tentative marks and all-day/multi-day handling in the user's own time zone, refreshed within five minutes.
- Mail and calendar panels, inbox and account management (spec 002 Slice C, US2 Microsoft, US3, US4, behind `panels.microsoft` and `panels.standards`): Microsoft Graph inbox delta and a from-scratch read-only IMAP client (one `Socket` interface, real adapters for Node `node:tls` and Cloudflare Workers `cloudflare:sockets`) feeding the `InboxPanel`; a CalDAV calendar source for standards-based accounts; account management (rename, recolour, pause/resume, per-calendar toggles, reconnect, disconnect that revokes then cascades, JSON export, ownership matrix) and a daily job that purges a 30-day-idle user's cached panels while keeping the connection and credentials.
- Mail and calendar panels, Google mail (spec 002 Slice D, US2, behind `panels.google_mail`, dark in production until Google's CASA assessment passes per ADR-0004): Gmail `messages.list`/`messages.get` client with the same fifty-message cap and preview truncation as the other providers.
- Dashboard widgets, strip and currency (spec 003 Slice A, behind `widgets.currency`, dark in production): the widget strip on the month view with add, edit and remove, and the currency widget with up to six codes, daily change and a seven-day sparkline from the cached ECB rates.
- Dashboard widgets, weather and places (spec 003 Slice B, behind `widgets.weather`, dark in production): Open-Meteo place search and resolve, the weather widget and place picker with a per-user temperature unit, a shared per-place reading cache refreshed by a background job, a daily purge job, quota-pause handling with a `/healthz/widgets` probe, and per-source usage logging (ADR-0005).
- Dashboard widgets, reorder and duplicate (spec 003 Slice C, no flag): reorder the strip, duplicate a widget, and a refresh action.
- Dashboard widgets, spend pace, fixed costs and sunrise (spec 003 Slice D, behind `widgets.spend_pace`, `widgets.fixed_costs` and `widgets.sunrise`, dark in production): month spend pace against budget, fixed costs remaining this month, and sunrise and sunset for a chosen place.
- Dashboard widgets, Today strip (spec 003 Slice E, behind `panels.today`, dark in production): the same widget strip on the Today page, after the calendar and inbox panels, sharing one store with the month view and rendering even when the panels fail to load.

### Fixed

- PR preview deploys switch the `widgets.*` and `panels.today` flags on at startup (new `FLAGS_ON` env var, refused on production), so the add-widget sheet no longer opens empty on a preview; when no widget type is enabled the sheet now says "No widgets available yet" instead of showing nothing.
- Widgets (spec 003 convergence, T080–T086):
  - A failed widget load now shows an error or offline state instead of "No widgets yet".
  - Spend pace shows the spend so far when no budget is set.
  - Weather outlook days carry a condition word that screen readers announce.
  - Rate changes always show one decimal place.
  - An installed app opened offline shows the last widget figures.
  - Every weather and rate source call is logged, and the logs name `limit_reached` when a source hits its limit.
- Widgets (PR #26 review, T087–T098):
  - Weather and sunrise dates use the time zone the weather source reports for the place, so one user's bad zone can no longer change another user's dates.
  - The first weather reading fetched when a place is chosen is rate-limited (10 a minute per user), and its failures are logged.
  - Database errors during a weather refresh are no longer counted as weather-source failures.
  - A failing rates history request fails its job so it is retried; a currency pair the source does not publish is logged once and not retried.
  - Choosing a place is recorded in the audit trail (`place.chosen`).
  - The add-widget sheet shows an error when the widget list fails to load, and place search and widget settings word their errors by cause (paused, rate-limited, unreachable, signed out).
- `deploy-fly`'s promote-production job deploys with `infra/fly/fly.toml` (it failed on the machineless production app) and rolls back by redeploying the previous image (`flyctl releases rollback` doesn't exist); `jobs-safety-net` runs the current release image instead of a nonexistent `:latest`.
- The post-deploy smoke is seven atomic tests, one concern each (health, sign-up, add, edit, delete, currency change, account deletion), each on its own API-created account, instead of one chained round trip.
- Sign-up no longer fails when the verification email can't be sent (the account was saved but the request 500'd, and retries silently did nothing). Unverified accounts can now sign in for 7 days; Settings shows an "Unverified" badge with "Resend verification email"; after 7 days sign-in is locked until verified, and housekeeping only purges unverified accounts that never signed in (FR-001 revised).
- Deploy workflows set `RESEND_API_KEY`/`MAIL_FROM` on preview, staging and production Fly apps when the matching `*_RESEND_API_KEY`/`*_MAIL_FROM` repo secrets exist (ADR-0002 item 2: Resend).
- `pnpm --filter @desk/db db:seed` silently did nothing on Windows (hand-built `file://` path never matched `import.meta.url`), and the seeded `e2e@desk.test` user had no categories; seed now uses `pathToFileURL` and inserts the default categories idempotently (palette shared via `@desk/core`'s `seedColour`).
- App header nav (Month · Year · Categories · Settings) on signed-in screens — settings and the other views were previously reachable only by typing the URL.
- Onboarding: Skip, Finish, "Add an expense" and "Connect Notion" now leave the wizard — the session store takes the PATCHed user, so the router guard no longer bounces every route back to `/onboarding`.
- Cloudflare Worker (`apps/api/src/worker.ts`): password hashing, rate limiting, mail and FX rates were lazy placeholders that threw on every use; now real, Workers-compatible adapters (mailer/connector-token encryption still need `RESEND_API_KEY`/`SECRET_BOX_KEY` as Cloudflare secrets before Stage 2 goes live).
- Settings' session list now shows a parsed browser/operating system pair instead of the raw User-Agent string (FR-004).
- Housekeeping job now purges `expense_versions` rows older than 12 months (FR-015) — the table existed since Phase 3 but the purge step was left unwired.
- Landing page: the `screenshots` array was defined but never rendered; wired up and populated with real captures of the month view, category budgets and the mobile month view.

### Added

- Phase 0 foundation: pnpm monorepo (`apps/web`, `apps/api`, `packages/*`, `tests/e2e`), `/healthz` and the Hello page, `users` migration, Docker and compose stack, Fly and Cloudflare configs, CI pipeline (lint → typecheck → unit → api → worker-build → e2e-ci), Fly preview per PR, staging deploy from `main`, e2e-local skeleton, repo hygiene (PR template, CODEOWNERS, Dependabot, CodeQL, SECURITY.md, `.env.example` with startup validation), ADR-0001 and draft ADR-0002.
- Phase 1 — accounts and currency core: email+password auth (Argon2id) and Google OIDC sign-in, server-side sessions with rotation, CSRF, auth rate limits, account deletion and JSON data export; settings page (profile, default currency, theme, delete account); `Money` type and conversion/rounding in `packages/core` with property-based tests; `connectors/rates` frankfurter client + fixtures + fake and the nightly rate-cache job; `packages/ui` design tokens and base components; ownership-matrix auth API suite.
- Phase 2 — expenses: add/edit/delete expense flows in multiple currencies, categories (seeded defaults, fixed/variable/one-off kinds), month view with category bars and entries table, CSV/column-mapped import with an undoable batch commit, budget core and forecast maths.
- Phase 3 — Notion sync and auto-capture: Notion public OAuth connector with encrypted tokens, database picker / "create one for me", two-way sync engine (`last_edited_time` diff, latest-edit-wins, audit table) on a 5-minute schedule plus immediate app-side runs, Connectors settings page; generic capture webhook (`/hooks/generic/<token>`) with dedupe, category mapping and token rotation.
- Phase 4 — premium UI, PWA, landing page: motion tokens, skeleton/empty/error states, command palette, responsive audit at 360px; installable PWA with an offline add-queue that flushes on reconnect and an install prompt; year view, category drill-down, budget forecast and month comparison insights; `apps/landing` marketing site (vite-ssg) with three-step onboarding, privacy and terms pages; in-app first-login onboarding.
