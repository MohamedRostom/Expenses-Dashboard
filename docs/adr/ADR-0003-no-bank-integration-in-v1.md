# ADR-0003: No bank integration in v1

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Rostom (owner)
**Amends:** ADR-0001 (F3 CSV import, F5 webhooks, testing strategy)

## Context

ADR-0001 planned two bank-specific pieces for v1: a Monzo-format CSV import and a per-user
Monzo webhook (`/hooks/monzo/<token>`). Research during the baseline specification found that
Monzo's developer API is documented as unsuitable for public applications: it may only connect
to the developer's own account or a small explicit allow-list. A public product cannot build on
it, and any other bank feed needs a licensed open-banking provider, which is a product and cost
decision in its own right.

## Decision

v1 ships no bank integration of any kind: no bank-specific import formats, no bank webhooks, no
open-banking feed. What remains:

- **Import**: one column-mapped import for any spreadsheet export. Duplicates are detected by an
  id column when the user maps one, otherwise by date, amount, currency and description.
- **Auto-capture**: the generic per-user webhook (`/hooks/generic/<token>`) for phone
  automations, with a client-supplied id for replay safety.

Bank feeds return in v2 through an open-banking provider chosen by a future ADR. Monzo is not
mentioned in specs, roadmap or code until then.

## Consequences

Phase 2 loses the Monzo-format importer and Phase 3 loses one webhook and its recorded
fixtures, shortening both. The generic path covers the owner's own capture needs via phone
automation. The `docs/ROADMAP.md`, `CLAUDE.md` and the baseline spec are updated in the same
change; ADR-0001 keeps its original text with an amendment note.
