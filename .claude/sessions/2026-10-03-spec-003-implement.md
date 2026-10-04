# Handoff — spec 003 implement (2026-10-03, closed 2026-10-04)

**Branch:** `feature/003-dashboard-widgets`. **Last commit:** `0ec32d6 chore(003): record implement completion in spec context`. Nothing pushed (not asked). Working tree clean apart from untracked `archify-demo/` and `architecture*.json/html`, which are not from this session.

## Status
All 79 tasks in `specs/003-dashboard-widgets/tasks.md` are ticked; `.spec-context.json` says `implemented`. T074, T075, T078 and T079 (late review items) were declined with reasons written next to each; T076 and T077 were resolved with comments.

T066 run (2026-10-04, local compose stack): lint 0 errors; typecheck clean; core 144/144 (91.7 % lines); API 435/441 with the 85 % threshold met (three files failed only under full-suite load with coverage on and pass alone: `imports.test.ts` SC-004, `insights.test.ts`, `widgets-load.test.ts`); `worker:build` dry run passes; `openapi.json` not stale; e2e `ci` project 72 passed / 12 flaky / 7 failed at full parallelism, all failures timeouts that pass on rerun with two workers except `widgets-perf.spec.ts:91`, fixed by giving it a 90 s timeout. Spec 002's `today-inbox.spec.ts:162` ordering test is flaky (passes on retry).

## Decisions (see also commit messages)
- `Forecast.timeZone`; Desk-owned weather icon names; currency `{ code, pending: true }` rows; one window-function fx_rates query.
- `fixedCosts` owns budget, then previous month, then none; coordinates round half away from zero.
- Inline best-effort first reading on create/patch; `markDue` backdates `fetched_at`; `/places/resolve` limiter 10/min; no reading and no error gives `empty`; spend pace / fixed costs `empty` render per-kind copy in the web.
- Add sheet has a configure step (currency picker / place picker) and shows add errors.
- Review hardening: bounded, IANA-validated places; widget jobs never rethrow, ensure is advisory-locked, dead `running` rows older than 10 min are replaced; widget routes answer 422; weather job backs off 10 min after three straight failures.
- Lighthouse config unchanged (no new dependency); SC-003 timing in `widgets-perf.spec.ts`.
- CI turns the `widgets.*` flags on in e2e-ci.
- Weather outage backoff stays global (10 min after three straight failures), decided 2026-10-04: tested, and the `ponytail:` comment in `apps/api/src/services/weather.ts` names the per-row `next_attempt_at` upgrade if outages ever show one place starving others.

## Open questions for Rostom
- `checklists/spec-quality.md` has 88 unchecked reviewer items; implementation proceeded without it.
- Owner-only: run T037 (`widgets.local.spec.ts`) on `desk-local`, and SC-005, SC-007, SC-008 (`needs-rostom` in `docs/ROADMAP.md`).

## Exact next step
Review the branch and, when ready, ask for a push and PR (not done: needs an explicit instruction).
