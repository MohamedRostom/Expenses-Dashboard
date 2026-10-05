# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A responsive web app installable as a PWA (`apps/web`), plus a static marketing site (`apps/landing`). Both inherit this file; each surface's mode lives in its own brief.

## Users

Three audiences, weighted equally (confirmed 2026-10-05):

- **The budget-minded individual** tracks their own spending against monthly category budgets. They log an expense on the phone right after paying and review the month at a desk.
- **The multi-currency earner or traveller** earns in one currency and spends in several, and needs every conversion to be exact and explainable.
- **The Notion-centric tracker** already keeps expenses in Notion and wants a real dashboard, phone capture and budgets without leaving Notion behind.

The base case is a single person managing their own money. Each account is isolated, with no shared household or team accounts in v1.

## Product Purpose

Desk is a public, multi-user, multi-currency expense tracker. It started as the owner's personal claude.ai dashboard ("Rostom's Desk"), which stays in use outside this repo, and this repo is the productised rewrite. Success means a person can add an expense in about 15 seconds on a phone (SC-009, not yet measured) and see at a glance where the month stands against their budgets.

## Positioning

Four claims, all of them true of the shipped code:

1. **Exact multi-currency.** Every expense keeps its original amount and currency, the dated ECB rate used and its source, all in integer minor units. When a rate was missing for a weekend or holiday, the record shows which date's rate was used instead. Changing the default currency re-derives every row.
2. **Two-way Notion sync.** The app's own database is the source of truth. Notion is an optional per-user mirror that syncs in both directions over Notion's public OAuth.
3. **Phone auto-capture.** Each user gets a secret webhook address that generic phone automations (MacroDroid, Shortcuts) post to, so an expense is logged without opening the app. Bank integrations are excluded from v1 (ADR-0003).
4. **A desk, not a ledger.** One calm daily view brings spending and budgets together with Today, read-only calendar and mail panels, and weather and currency widgets. The v2 panels and widgets ship behind flags (ADR-0004, ADR-0005).

## Operating Context

- **Phone, moment of payment:** a quick add or an automatic capture, often one-handed.
- **Desktop, review:** the month view, category bars against budgets, the entries table, the year and category views, imports from bank CSVs (column-mapped), and the bin.
- **Notion:** the user's own "Expenses" database, whose schema the connector can create or extend.
- **Settings and connections:** default currency, categories and budgets, Notion, the capture address, and mail and calendar accounts.

## Capabilities and Constraints

- Sign-in uses email and password, or Google with `openid email profile` only. Connector scopes are granted per connection, never on the sign-in grant.
- Money is stored as integer minor units and is never shown with float artefacts. Rates come from frankfurter (ECB) and are cached daily.
- Mail and calendar panels are read-only and never linked to expenses. Google mail is gated on a CASA assessment.
- Any user-facing feature merged before it is announced ships behind a flag. Changes to the look of existing screens need no flag.
- The product must run on Cloudflare Workers at Stage 2, so any dependency has to be Workers-compatible.
- **Undecided (ADR-0002):** the product name, with "Desk" a working placeholder that must not be treated as final or replaced by an invented name; the email provider (Resend chosen, ADR not yet accepted); the licence; and analytics.

## Brand Commitments

- The name is "Desk (working name)". Do not invent another one.
- The voice is plain, exact and calm. Error copy is specific to the error code, never one generic banner.
- Every panel has designed skeleton, empty and error states (constitution VI, "Finished Surfaces").
- The visual identity is governed by the root `DESIGN.md` (the incumbent system, captured 2026-10-05; spec 004 T028 replaces it with the approved direction), and any new identity needs the owner's approval in ADR-0006 (spec 004). This file sets no visual direction.

## Evidence on Hand

- A real reference implementation exists: the owner's personal dashboard (https://claude.ai/artifact/8NYn6oHidCGpzz9U6Mgz8d) and the auto-logging guide (https://claude.ai/artifact/77wgXNJHeP8PSEVu89mv1x).
- There is a working product with releases since `v0.1.3` (2026-09-26), shown in `CHANGELOG.md`.
- There are **no** users, testimonials, sign-up numbers, pricing or press yet. SC-006 (three observed sign-ups) has not been run. Do not fabricate any of these.

## Product Principles

1. **Exactness earns trust.** Every number can be traced back to its original amount, rate and date.
2. **Capture costs seconds.** Adding an expense, by hand or automatically, should never be the reason someone stops tracking.
3. **The user's data stays theirs.** The app holds the truth, Notion mirrors it on request, and no account ever sees another's data.
4. **Calm over busy.** The daily view answers "where does my month stand?" first, and every other panel stays secondary.
5. **No half-finished surfaces.** A screen isn't done until its loading, empty and error states are.

## Accessibility & Inclusion

WCAG 2.2 Level AA throughout: text contrast of 4.5:1 (3:1 for large text and non-text controls); a visible focus indicator at least 2 px thick with 3:1 contrast; and all motion can be turned off. Tap targets are 44 px on phone and at least 24 px on desktop, where dense table rows and menu items may use 32 px. CI enforces axe and Lighthouse a11y ≥ 95.
