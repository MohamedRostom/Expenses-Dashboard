# ADR-0002: Naming and providers

**Status:** Proposed (draft; nothing here is decided until Rostom accepts it)
**Date:** 2026-09-16
**Deciders:** Rostom (owner)

## Context

ADR-0001 left five items open because only the owner can decide them: they involve a name, spending money, or a legal choice. Until this ADR is accepted, code and docs use the working name "Desk", the Stage 1 database is whatever `DATABASE_URL` points at, and no email or analytics provider is wired in. Each section below states the question, the options considered in the planning conversation, and a recommendation. Rostom fills in the decision.

## 1. Product name and domain

Needed before the landing page (Phase 4) and the Google OAuth consent screen (Phase 1), both of which display it. Constraints: available as a `.app` or `.com`, not trademarked in the finance space, works as a PWA icon label (≤ 12 characters).

Options: keep "Desk"; a coined word; a descriptive name.
Decision: _pending_.

## 2. Transactional email provider

Needed for email verification in Phase 1. Both candidates have a free tier large enough for a beta.

- **Resend**: simplest API, first-class Node SDK, works from Workers with plain `fetch`.
- **Postmark**: longer track record for deliverability, slightly more setup.

Recommendation: Resend, behind a `Mailer` interface so it can be swapped.
Decision: Resend (2026-09-25, Rostom). Wired per environment through the `PREVIEW_`/`STAGING_`/`PRODUCTION_RESEND_API_KEY` and `_MAIL_FROM` repo secrets; each deploy workflow sets them on the Fly app only when present, otherwise the SMTP fallback stays. Sending domain still to be verified in Resend before real users get mail.

## 3. Stage 1 database: Fly Postgres or Neon from day one

- **Fly Postgres**: everything in one dashboard; needs a `pg_dump` migration to Neon in Phase 6.
- **Neon from the start**: no Phase 6 migration; branch-per-PR databases for previews; one more account.

Recommendation: Neon from day one. It removes a migration step and gives preview apps isolated databases. Phase 0's preview workflow currently expects a single `PREVIEW_DATABASE_URL`; with Neon it can create a branch per PR.
Decision: **Neon from day one** (2026-09-20). One Neon project, one branch per environment (`preview`, `staging`, `production`); each branch's connection string is stored as that environment's `*_DATABASE_URL` GitHub secret.

## 4. Licence

The repository already contains an MIT `LICENSE` file from creation. Keeping MIT means the code is open source and the private repo can be made public. "All rights reserved" means replacing that file before the repo goes public.

Decision: _pending_ (MIT is the default unless changed).

## 5. Analytics

- **None**: nothing to disclose in the privacy page.
- **Self-hosted cookie-less counter** (Plausible-style): page views only, no user identification, allowed by the security baseline in ADR-0001.

Recommendation: none for v1; revisit after the beta.
Decision: _pending_.

## Consequences

When accepted: rename "Desk" across `apps/`, `infra/` and docs if the name changes; add the chosen mailer to `.env.example`; set `DATABASE_URL` secrets accordingly; update `CLAUDE.md`.
