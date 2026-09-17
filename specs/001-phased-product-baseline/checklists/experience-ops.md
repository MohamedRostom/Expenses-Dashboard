# App Experience and Operations Requirements Checklist: Phased Product Baseline

**Purpose**: Validate that the PWA, insight, landing, onboarding and operational requirements (Stories 7 to 10, FR-018 to FR-025) are complete, clear, consistent and measurable before tasks are generated
**Created**: 2026-09-16
**Feature**: [spec.md](../spec.md), cross-checked against [quickstart.md](../quickstart.md), [research.md](../research.md) and the constitution (Principle VI)

**Review Ownership**: Reviewer-owned (Rostom, before `/speckit-tasks`). Mark an item `[x]` only when the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Requirement Completeness

- [ ] CHK001 Are the contents of the offline queue defined (adds only, or also edits and deletes), and is that limit stated in the spec rather than only in research R13? [Completeness, Spec §FR-018]
- [ ] CHK002 Are requirements defined for what the user sees in the month view while queued expenses are unsynced (totals with or without them)? [Gap, Spec §FR-018]
- [ ] CHK003 Are the loading, empty and error states enumerated per panel, or only required in general? [Completeness, Spec §FR-019]
- [ ] CHK004 Are the inputs and formula of the forecast defined in the spec so that "states its basis" has a fixed meaning? [Completeness, Spec §FR-020, §User Story 8]
- [ ] CHK005 Are the onboarding steps' skip and resume behaviours specified? [Gap, Spec §FR-021, §User Story 7 scenario 3]
- [ ] CHK006 Are the landing page's required contents (name, screenshots, three steps, privacy, terms) tied to the pending product-name decision with a stated fallback? [Completeness, Spec §FR-021, §Assumptions]
- [ ] CHK007 Are requirements defined for the feedback message (length, attachments, what is captured with consent) and for who receives it? [Completeness, Spec §FR-023]
- [ ] CHK008 Are the backup contents, encryption at rest and retention period specified? [Gap, Spec §FR-024]
- [ ] CHK009 Are requirements defined for what "the previous service kept as a fallback for 30 days" means for writes made during that period? [Gap, Spec §FR-025]

## Requirement Clarity

- [ ] CHK010 Is "two taps from the home screen" defined with the starting state (unlocked phone, app closed) and what counts as a tap? [Clarity, Spec §FR-018, §User Story 7 scenario 1]
- [ ] CHK011 Is "error messages specific to the failure" defined with the set of failure kinds that must have distinct copy? [Clarity, Spec §FR-019]
- [ ] CHK012 Is "no serious violations" tied to a named accessibility standard and severity scale? [Clarity, Spec §FR-019, §User Story 7 scenario 4]
- [ ] CHK013 Is "usable at phone width" quantified with a minimum viewport (the constitution names 360 px; the spec does not)? [Clarity, Spec §User Story 7, Constitution §VI]
- [ ] CHK014 Is "outages are detected within minutes" quantified with a detection interval and who is notified? [Clarity, Spec §FR-023]
- [ ] CHK015 Is "switchable per user without a new release" clear about who performs the switch and how quickly it takes effect? [Clarity, Spec §FR-022]

## Requirement Consistency

- [ ] CHK016 Do the audit thresholds in FR-019 and SC-006 (performance 90, accessibility 95) match the constitution's definition of done and the roadmap? [Consistency, Spec §FR-019, §SC-006]
- [ ] CHK017 Does "install on phones" in FR-018 match the device list used by the quickstart's device projects? [Consistency, Quickstart §Phase 4]
- [ ] CHK018 Do the availability, backup and restore numbers in FR-024, SC-007 and the Clarifications entry agree? [Consistency, Spec §FR-024, §SC-007]
- [ ] CHK019 Does the offline duplicate rule in Story 7 scenario 2 rely on the same identity as the import and capture duplicate rules, or on a different one? [Consistency, Spec §User Story 7, §FR-013, §FR-016]
- [ ] CHK020 Is the "English interface only" assumption consistent with the landing page and privacy page requirements? [Consistency, Spec §Assumptions, §FR-021]

## Acceptance Criteria Quality

- [ ] CHK021 Is SC-006's "three people outside the project sign up unaided" defined with how "unaided" is observed and recorded? [Measurability, Spec §SC-006]
- [ ] CHK022 Is SC-009's "under 15 seconds from unlocking the device" defined with a device class and network condition? [Measurability, Spec §SC-009]
- [ ] CHK023 Is SC-008's "zero data loss verified by per-user totals" precise about which totals and whether binned rows count? [Measurability, Spec §SC-008]

## Scenario and Edge Case Coverage

- [ ] CHK024 Are requirements defined for a queued offline expense that fails validation once online (rejected currency, deleted category)? [Exception Flow, Gap, Spec §FR-018]
- [ ] CHK025 Are requirements defined for the installed app when the user's session has expired while offline? [Edge Case, Gap]
- [ ] CHK026 Are requirements defined for the forecast in a month with no fixed-kind budgets or no spend? [Edge Case, Gap, Spec §FR-020]
- [ ] CHK027 Are requirements defined for the feedback widget when the user is offline or rate limited? [Coverage, Gap, Spec §FR-023]
- [ ] CHK028 Are rollback requirements defined if the infrastructure move fails after the DNS change? [Recovery, Gap, Spec §FR-025]

## Dependencies and Assumptions

- [ ] CHK029 Is the dependency of Story 9 on the ADR-0002 name decision stated with what can proceed before it? [Dependency, Spec §Assumptions]
- [ ] CHK030 Are the third-party services assumed for operations (error tracking, uptime monitor, backup storage) named in the requirements or left to the plan only? [Assumption, Research R15, R16]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Leave items unchecked when they still require clarification, correction, or reviewer evaluation
- `/speckit-implement` reads checklist state but does not modify markers
