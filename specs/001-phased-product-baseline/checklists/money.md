# Money and Currency Requirements Checklist: Phased Product Baseline

**Purpose**: Validate that the expense, conversion, budget and import requirements (Stories 2 to 4, FR-006 to FR-013, FR-027) are complete, clear, consistent and measurable before tasks are generated
**Created**: 2026-09-16
**Feature**: [spec.md](../spec.md), cross-checked against [data-model.md](../data-model.md), [contracts/api.md](../contracts/api.md), [research.md](../research.md)

**Review Ownership**: Reviewer-owned (Rostom, before `/speckit-tasks`). Mark an item `[x]` only when the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Requirement Completeness

- [ ] CHK001 Are the exact fields an expense must carry enumerated once, and do Story 2, FR-006 and the Expense entity list the same set? [Completeness, Spec §FR-006, §Key Entities]
- [ ] CHK002 Are requirements defined for an expense whose currency equals the default currency (rate, rate date and source values)? [Gap, Spec §FR-007]
- [ ] CHK003 Are requirements stated for how a category's monthly budget behaves when the default currency changes? [Gap, Spec §FR-010, §FR-011]
- [ ] CHK004 Are the seeded default categories and their fixed-kind defaults specified in the spec rather than only in CLAUDE.md? [Completeness, Spec §FR-011]
- [ ] CHK005 Are requirements defined for the behaviour of budgets in months before a category existed or after it is archived? [Gap, Spec §FR-011]
- [ ] CHK006 Are the required import file characteristics (encoding, delimiter, size limit, header handling) specified? [Gap, Spec §FR-013]
- [ ] CHK007 Are requirements defined for undoing an import after some imported rows have been edited? [Gap, Spec §User Story 4]
- [ ] CHK008 Is the required precision of stored exchange rates and of displayed rates specified? [Gap, Spec §FR-007]

## Requirement Clarity

- [ ] CHK009 Is "store every amount exactly" defined in terms that exclude floating-point representations without naming an implementation? [Clarity, Spec §FR-007]
- [ ] CHK010 Is the rounding rule for converted amounts named (half-even) in the spec, or only in research.md? [Clarity, Spec §FR-008, Research R5]
- [ ] CHK011 Is "previous published rate" defined precisely enough to resolve a Monday expense, a bank-holiday run of several days, and a date before any rate exists? [Clarity, Spec §FR-008, §Edge Cases]
- [ ] CHK012 Is "reversible" for a rate override defined (what value the row returns to, and whether the original fetched rate is retained)? [Clarity, Spec §FR-009]
- [ ] CHK013 Is the description normalisation used in the duplicate fingerprint (case, whitespace, punctuation) specified in the spec, not only in research.md? [Clarity, Spec §FR-013, Research R12]
- [ ] CHK014 Are "over-budget state" and "remaining" quantified (sign, rounding, treatment of categories without a budget)? [Clarity, Spec §FR-012]
- [ ] CHK015 Is "shows progress" for the currency-change job quantified (update frequency, what counts as done, failure display)? [Clarity, Spec §FR-010, §User Story 2 scenario 4]

## Requirement Consistency

- [ ] CHK016 Do the seven conversion fields named in the constitution (Principle III), FR-007 and the expenses table in data-model.md match exactly, including `rate_overridden`? [Consistency, Spec §FR-007, Data Model §expenses]
- [ ] CHK017 Is the duplicate rule identical across the Clarifications answer, Story 4 scenario 3, FR-013 and the import_rows entity? [Consistency, Spec §Clarifications, §FR-013]
- [ ] CHK018 Does the API contract's `POST /expenses` body (major-unit amount vs minor units) agree with FR-007's exact-storage requirement and the generic webhook's amount rule? [Consistency, Contracts §Phase 2, §generic-webhook]
- [ ] CHK019 Are "bin", "deleted", "restore" and "purge" used consistently between Story 2, FR-006, the Edge Cases and the expenses lifecycle in data-model.md? [Consistency]
- [ ] CHK020 Do SC-003 ("reconcile to the penny") and the research property test tolerance ("within one minor unit") describe the same acceptance rule? [Conflict, Spec §SC-003, Research R5]
- [ ] CHK021 Do the keyboard shortcut requirements in FR-012 match the shortcuts listed in CLAUDE.md and the roadmap? [Consistency, Spec §FR-012]

## Acceptance Criteria Quality

- [ ] CHK022 Can SC-004 (1,000-row import under one minute) be measured independently of network conditions for rate lookups? [Measurability, Spec §SC-004]
- [ ] CHK023 Is SC-010 (month view under one second at 20,000 expenses) defined with a measurement point (server response vs rendered view) and device class? [Measurability, Spec §SC-010]
- [ ] CHK024 Are acceptance scenarios defined for the year summary equalling the sum of month summaries when rates were pending for some rows? [Coverage, Spec §User Story 8, §Edge Cases]

## Scenario and Edge Case Coverage

- [ ] CHK025 Are requirements defined for expenses with zero amount and for currencies with zero or three decimal places? [Edge Case, Gap]
- [ ] CHK026 Are requirements defined for an expense date in the future or more than five years in the past? [Edge Case, Gap, Spec §Assumptions]
- [ ] CHK027 Are requirements defined for the month view when the user's default currency changed mid-month? [Coverage, Gap, Spec §FR-010]
- [ ] CHK028 Are requirements defined for a rate provider that returns a rate but for a date later than the requested one? [Edge Case, Gap, Spec §FR-008]
- [ ] CHK029 Are requirements defined for import rows whose currency is not in the ISO 4217 list, or whose amount has more decimals than the currency allows? [Edge Case, Spec §Edge Cases]

## Dependencies and Assumptions

- [ ] CHK030 Is the dependency on a free central-bank rate source stated with its known limits (business days only, limited currency list) and a fallback when a currency is unsupported? [Dependency, Spec §Assumptions]
- [ ] CHK031 Is the assumption "no live intraday rates" reflected in every acceptance scenario that mentions a rate? [Assumption, Spec §Assumptions]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Leave items unchecked when they still require clarification, correction, or reviewer evaluation
- `/speckit-implement` reads checklist state but does not modify markers
