# Session handoff — 2026-09-26: spec 002 (mail and calendar panels), Phases 1–2

## Where things stand

- **Branch:** `feature/002-mail-calendar-panels` (local only, **never pushed**; push only when Rostom asks).
- **Last committed:** `7d4ba93 docs(002): changelog for Phases 1-2; tick T018-T020, T022, T023`.
- **Phases 1–2 are complete:** T002–T023 are all [X]. Verified locally: full API suite green (232 tests, 5 todo), core unit (86), connectors (46), web (73), typecheck, lint (0 errors), `worker:build`, web build.
- **Checkpoint:** the planning-complete state is logged in `.claude/checkpoints.log` as `002-planning-remediated` at `907f257`.

## What was done this session

1. **Analysis.** `/speckit-analyze` on specs/002 found 2 CRITICAL, 7 HIGH and about 20 MEDIUM/LOW findings. All were fixed in `23a887f` and `907f257`.
2. **Checklist.** `checklists/spec-quality.md` (47 items) was reviewed; spec.md gained FR-018 to FR-024 and sharper wording. Commit `f045c93`.
3. **Implementation.** `/speckit-implement`, Phases 1–2 only, under Rostom's cut-over waiver, which is recorded at the top of tasks.md.

| Task | Status | Commit |
|---|---|---|
| T002–T005 | [X] | 536a4f8, c6d2e9c |
| T006, T013 | [X] | 9c2f6ac |
| T007–T010 (failing tests first) | [X] | 6946fa2 |
| T011, T012, T014, T015 | [X] | 107d9fe, c48beef, ed0ce98 |
| T016, T017, T021 | [X] | 56dfb68, a407c0d |
| T018–T020, T022–T023 | [X] | fe2943d, 5517e10, 7d4ba93 |

Phase 3 (US1) onward waits for the Stage 2 cut-over (spec 001 T119, owner-only).

## Decisions made (all binding unless Rostom reopens them)

- **Branch naming:** `feature/002-<slice>`. The `phase-N/` convention is for ROADMAP phases 0–6.
- **Model routing:** Opus (main session) decides and reviews. Sonnet coordinates and briefs. Haiku implements.
  - The agents live in `.claude/agents/coordinator.md` and `implementer.md`. They load only in a new session; in this one they ran as `general-purpose` with a model override.
  - Implementers never `git add`/`commit`; the main session commits after review. lint-staged stashes unstaged files, which races with running agents.
  - Haiku's tests need strict review: it wrote `expect(true)`, `expect([a,b]).toContain(status)`, swallowed `try/catch` and `.catch()`, and placeholder ids. Reject all of these.
- **Addresses:** stored as lowercased `text`; the repo has no `citext`.
- **Flag rows:** migration `0009_panels` inserts the five `panels.*` flag rows (off), so every environment has them without running the seed.
- **Flag gate:** `apps/api/src/middleware/require-flag.ts` (`requireFlag(db, key)` → 404 when off) is the single pattern. Both the Today and Connections routes use it.
- **Recurring jobs:** the scheduler re-enqueues itself on the existing job tick, like `notion-sync` (node.ts `setInterval`, worker.ts cron).
- **Test fetch stubs:** connector clients take an injected `fetchImpl`, like NotionClient.
- **`last_active_at`:** written by the session middleware using the injected clock. It drives the activity tier and the 30-day purge, because Stage 2 sessions live in KV.
- **Connected address:** comes only from the provider's `id_token` (`openid email` requested from Google and Microsoft), decoded without signature verification because it arrives directly from the token endpoint over TLS. Never fall back to the Desk login email.
- **Callback errors:** the OAuth callback always 302s; failures carry `?error=invalid_state | provider_unreachable | scope_denied | limit_reached | account_mismatch`.
- **Account limit:** at ten accounts, `/start` allows only `account=<owned id>` (adding a capability). The callback refuses a new eleventh row.
- **Manual refresh:** `POST /connections/:id/refresh` enqueues directly (bypassing the scheduler's error skip), so a manual refresh can clear `error`. It was moved into Phase 2 because T008 tests it.
- **Ownership rows:** rows for routes from later phases (T035, T060, T070) are `it.todo`, so the Phase 2 API suite can go green.
- **Today API path (2026-09-26):** `/panels/today` and `/panels/today/refresh`; `/today` is the page only. Web and API share one origin and API routes win, so an API `/today` broke reloads. New API prefixes must also go in `apps/web/vite.config.ts` (proxy list and SW denylist).
- **Web flags:** a minimal flags store is added in wave 5; there was no client-side flags mechanism before.
- **Rules added today:**
  - Quota wind-down: at 90 % of the 5-hour quota, start no new agents, finish the running ones, and write a handoff here. It's in the project CLAUDE.md, `~/.claude/CLAUDE.md` and memory.
  - Model routing: in the project CLAUDE.md and memory.

## Known issues and open items

- **e2e-ci flags (fixed in b5a6f92, unverified until CI runs):** `packages/db/src/seed.ts` can switch the five `panels.*` flags on (`ENABLE_PANELS_FLAGS=true` or `flagsOn`), but the seed isn't run by the CI e2e job or compose. The e2e-ci job needs a step such as `pnpm flags set panels.today --global on` for each flag. Until then, `tests/e2e/tests/connections.spec.ts` will fail in CI.
- **e2e not run:** the Phase 2 compose e2e run (`pnpm test:e2e -- --project=ci --grep "Connections and Today"`) was not run locally this session.
- **Rate limit:** the refresh limit uses the shared fixed-window `PgRateLimiter`. "One per minute" can allow two calls across a window boundary. It's documented in the tests, and a sliding limit is a later decision if it matters.
- **Lint warnings:** 6 remain (4 in existing `packages/ui` files, 2 attribute-order warnings in the new Inbox and Connections views).
- The `local-secrets` GitHub environment exists but has **no required reviewers**; Rostom must add them.
- Rostom must also provide real test accounts for e2e-local (Google, Microsoft, Fastmail or iCloud, Yahoo). T079 is a Yahoo spike before US4.
- ADR-0002 items (name, domain, licence, analytics) block Google and Microsoft production verification. Until then Google and Microsoft stay in testing mode.
- Spec 004 `PanelFrame` doesn't exist; the web code uses `apps/web/src/components/PanelState.vue`.
- `.spec-context.json` files are modified by the companion extension; they're left uncommitted on purpose.

## Wave 5 acceptance (check before committing)

- Full `pnpm --filter @desk/api test` is green except `it.todo`. `panels-scheduler.test.ts` passes, as do the ownership rows for `POST /connections/:id/refresh` and the Today isolation test.
- `POST /today/refresh` and `/connections/:id/refresh` share `panels.refresh:<userId>`: one per minute, with 429 `rate_limited` and `retryAfterSeconds`.
- The temporary stub `GET /today` in app.ts is replaced by `routes/today.ts` behind `requireFlag`.
- Web: `/today` and `/settings/connections` redirect home when `panels.today` is off; the nav link is hidden; both empty states render per FR-014.
- Seed: flags are on only for the e2e/local seed path, never in production.
- `pnpm typecheck`, eslint, `pnpm worker:build` and `pnpm --filter @desk/web build` all pass.
- Then tick T018–T020 and T022–T023 in tasks.md and commit.

## Exact next step

1. Done 2026-09-26 (b5a6f92..9613803): e2e-ci flag step, flags CLI Windows fix, proxy gaps, Today error state, /panels/today move. Local checkpoint green: lint (0 errors), typecheck, unit, API (237), worker:build, compose e2e "Connections and Today" 3/3 (via system Chrome; the Playwright CDN times out on this machine).
4. Stop. Phase 3 needs the Stage 2 cut-over, and pushing or opening a PR needs Rostom's explicit instruction.
