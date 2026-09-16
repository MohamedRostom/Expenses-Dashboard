# Accounts and Security Requirements Checklist: Phased Product Baseline

**Purpose**: Validate that the account, isolation, session, export and deletion requirements (Story 1, FR-001 to FR-005, FR-026, FR-022) are complete, clear, consistent and measurable before tasks are generated
**Created**: 2026-09-16
**Feature**: [spec.md](../spec.md), cross-checked against [data-model.md](../data-model.md), [contracts/api.md](../contracts/api.md), [research.md](../research.md) and the constitution (Principle IV)

**Review Ownership**: Reviewer-owned (Rostom, before `/speckit-tasks`). Mark an item `[x]` only when the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Requirement Completeness

- [ ] CHK001 Are password rules (minimum length, maximum length, breached-password handling) specified anywhere in the requirements? [Gap, Spec §FR-001]
- [ ] CHK002 Are requirements defined for an unverified account that never completes verification (retention period, re-registration with the same email)? [Gap, Spec §FR-001]
- [ ] CHK003 Are requirements defined for changing the email address of an existing account? [Gap, Spec §User Story 1]
- [ ] CHK004 Are requirements defined for a Google sign-in whose email matches an existing password account (link, refuse, or ask)? [Gap, Spec §FR-001, Research R3]
- [ ] CHK005 Are session lifetime and idle-expiry requirements stated in the spec, or only in research.md? [Completeness, Spec §FR-004, Research R2]
- [ ] CHK006 Is the content of the export file specified precisely enough to be checked for completeness (which entities, which fields, whether binned rows are included)? [Completeness, Spec §FR-005, Contracts §export document]
- [ ] CHK007 Are requirements defined for what a user sees and can do while an account deletion or export is in progress? [Gap, Spec §FR-005]
- [ ] CHK008 Are requirements defined for how feature flags are administered (who can switch them, per user or globally)? [Gap, Spec §FR-022]

## Requirement Clarity

- [ ] CHK009 Is "invisible and inaccessible on every screen and every request" defined in a way that names the expected response for a foreign resource (not found vs forbidden)? [Clarity, Spec §FR-002, Contracts §Errors]
- [ ] CHK010 Are the rate-limit thresholds and cooling-off period for sign-in attempts quantified in the spec rather than left to research.md? [Clarity, Spec §FR-004, §User Story 1 scenario 5]
- [ ] CHK011 Is "clear message" for a rate-limited sign-in defined without revealing whether the account exists? [Clarity, Spec §FR-004, §FR-026]
- [ ] CHK012 Is "wipes all their data" enumerated against the data model so that a reviewer can confirm every user-owned table is covered? [Clarity, Spec §FR-005, Data Model §Cascade]
- [ ] CHK013 Is "the email can register again" after deletion qualified with a timing (immediately, after a cooling period)? [Clarity, Spec §User Story 1 scenario 4]
- [ ] CHK014 Are "active sessions" defined (what makes a session visible in the list, how a device is described)? [Clarity, Spec §FR-004]

## Requirement Consistency

- [ ] CHK015 Does the Google sign-in scope in FR-001 ("identity and email") match the constitution's `openid email profile` and research R3? [Consistency, Spec §FR-001]
- [ ] CHK016 Does the 20-minute reset link in FR-026 match the Clarifications entry, Story 1 scenario 6 and the email_tokens entity? [Consistency, Spec §FR-026, Data Model §email_tokens]
- [ ] CHK017 Is the "sign out all other sessions on reset" rule stated identically in FR-026 and the `/auth/password/reset` contract row? [Consistency, Contracts §Phase 1]
- [ ] CHK018 Do the export contents in FR-005, the contract's export document and the data-model derived view describe the same document? [Consistency]
- [ ] CHK019 Does the deletion requirement for a "connected integration" (Story 1 scenario 4) agree with the Notion disconnect rule that keeps data on both sides (Story 5 scenario 4)? [Conflict, Spec §User Story 1, §User Story 5]

## Acceptance Criteria Quality

- [ ] CHK020 Can SC-002's "isolation test finds zero leaks" be objectively scoped (which routes, which resource types, which users)? [Measurability, Spec §SC-002]
- [ ] CHK021 Is "under three minutes" for registration measured from a defined start and end event? [Measurability, Spec §SC-002]

## Scenario and Edge Case Coverage

- [ ] CHK022 Are requirements defined for a verification or reset link opened after it expired or after it was already used? [Coverage, Spec §User Story 1 scenario 6]
- [ ] CHK023 Are requirements defined for a user who has both a password and a linked Google account and removes one of them? [Edge Case, Gap]
- [ ] CHK024 Are requirements defined for account deletion while a background job (currency change, sync) is running, beyond the Notion case in Edge Cases? [Coverage, Spec §Edge Cases]
- [ ] CHK025 Are requirements defined for the theme setting's default and its interaction with the system preference? [Coverage, Gap, Spec §User Story 1]

## Non-Functional and Compliance

- [ ] CHK026 Are the data-protection obligations that drive export and deletion (UK GDPR) named in the requirements so the acceptance rule has a source? [Traceability, Gap]
- [ ] CHK027 Are requirements defined for how long audit records of deletions and connector actions are retained after the user is gone? [Gap, Data Model §audit_log]
- [ ] CHK028 Are requirements defined for the security headers and transport rules the constitution mandates, or are they assumed silently by the spec? [Gap, Constitution §Platform and Security Constraints]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Leave items unchecked when they still require clarification, correction, or reviewer evaluation
- `/speckit-implement` reads checklist state but does not modify markers
