# Sync and Capture Requirements Checklist: Phased Product Baseline

**Purpose**: Validate that the Notion two-way sync and capture-address requirements (Stories 5 and 6, FR-014 to FR-017) are complete, clear, consistent and measurable before tasks are generated
**Created**: 2026-09-16
**Feature**: [spec.md](../spec.md), cross-checked against [data-model.md](../data-model.md), [contracts/api.md](../contracts/api.md), [contracts/generic-webhook.md](../contracts/generic-webhook.md), [research.md](../research.md) and ADR-0003

**Review Ownership**: Reviewer-owned (Rostom, before `/speckit-tasks`). Mark an item `[x]` only when the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Requirement Completeness

- [ ] CHK001 Is the "known layout" of the Notion table specified in the spec (property names, types, select options) rather than only in CLAUDE.md? [Completeness, Spec §FR-014]
- [ ] CHK002 Are requirements defined for a Notion table that has the known layout but extra properties, or missing ones? [Gap, Spec §FR-014]
- [ ] CHK003 Are field-level mapping rules (currency, category, paid-with, kind, notes) between an expense and a Notion row specified? [Gap, Spec §User Story 5 scenario 1]
- [ ] CHK004 Are requirements defined for the first sync after connecting a table that already has rows (import them, ignore them, or ask)? [Gap, Spec §FR-014]
- [ ] CHK005 Are requirements defined for the sync direction being changed after data exists on both sides? [Gap, Spec §FR-014]
- [ ] CHK006 Are the retention and visibility rules for the change history ("both versions kept") specified? [Completeness, Spec §FR-015, Contracts §versions]
- [ ] CHK007 Are requirements defined for the capture-address category mapping's initial state and for what the user sees when a new label arrives? [Completeness, Spec §FR-017]
- [ ] CHK008 Are requirements defined for the time zone used when a captured message has no date? [Gap, Spec §FR-016, Webhook contract §date]

## Requirement Clarity

- [ ] CHK009 Is "within five minutes" defined from a stated start event (row saved) to a stated end event (visible on the other side)? [Clarity, Spec §FR-015, §SC-005]
- [ ] CHK010 Is "latest edit" defined with a clock source, and is the clock-skew edge case resolved rather than only named? [Clarity, Spec §FR-015, §Edge Cases]
- [ ] CHK011 Is "never create duplicates under retries, rate limits or partial failures" expressed as an identity rule (which key makes two rows the same)? [Clarity, Spec §FR-015]
- [ ] CHK012 Is "disconnect without losing data on either side" clear about whether Notion-side links are cleared and whether reconnecting resumes or restarts? [Clarity, Spec §User Story 5 scenario 4]
- [ ] CHK013 Is the receipt key for messages without a sender id defined in the spec, or only in the webhook contract? [Clarity, Spec §FR-016, Webhook contract]
- [ ] CHK014 Is "rotate" defined with the fate of in-flight messages and whether more than one address can be active? [Clarity, Spec §FR-016]

## Requirement Consistency

- [ ] CHK015 Do FR-016, Story 6 and the webhook contract agree on which fields are required and on the accepted amount format? [Consistency, Spec §FR-016, Webhook contract §Request body]
- [ ] CHK016 Does the refund rule in Edge Cases (negative amount creates a negative expense) agree with FR-006's expense definition and the month summary rules? [Consistency, Spec §Edge Cases, §FR-012]
- [ ] CHK017 Do the notion_connections status values in data-model.md match the statuses the connectors page must show per FR-014? [Consistency, Data Model §notion_connections]
- [ ] CHK018 Does the sync trigger described in research R8 (five-minute job plus immediate run after writes) match FR-015's promise and SC-005's measurement? [Consistency, Research R8]
- [ ] CHK019 Are all bank-related phrases removed consistently, so that "capture address", "phone capture" and `added_via = phone` refer to the same thing everywhere? [Consistency, ADR-0003]

## Acceptance Criteria Quality

- [ ] CHK020 Can SC-005's "100 % of trials over three consecutive nightly runs" be evaluated with a defined trial count per run? [Measurability, Spec §SC-005]
- [ ] CHK021 Is "capture-to-row under one minute" (Story 6 scenario 1) measurable when rate lookup is pending? [Measurability, Spec §User Story 6]

## Scenario and Edge Case Coverage

- [ ] CHK022 Are requirements defined for a Notion row edited into an invalid state (empty amount, unknown currency) during sync? [Edge Case, Gap]
- [ ] CHK023 Are requirements defined for a user who revokes the integration from inside Notion rather than from Desk? [Coverage, Gap, Spec §FR-014]
- [ ] CHK024 Are requirements defined for the Notion access token expiring or being invalidated mid-sync? [Recovery, Gap]
- [ ] CHK025 Are requirements defined for a captured message whose currency is valid but unsupported by the rate source? [Edge Case, Spec §Edge Cases]
- [ ] CHK026 Are requirements defined for burst traffic to a capture address beyond the stated per-minute limit (drop, queue, alert)? [Edge Case, Webhook contract §429]

## Dependencies and Assumptions

- [ ] CHK027 Is the dependency on a specific Notion API version and its rate limit stated as an assumption with an owner for revisiting it? [Dependency, Spec §Assumptions]
- [ ] CHK028 Is the assumption that Notion change notifications are not relied upon reflected in every timing requirement? [Assumption, Spec §Assumptions, §FR-015]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Leave items unchecked when they still require clarification, correction, or reviewer evaluation
- `/speckit-implement` reads checklist state but does not modify markers
