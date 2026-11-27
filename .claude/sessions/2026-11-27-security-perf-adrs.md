# Session handoff — 2026-11-27: security fixes, performance pass, optimistic UI, ADR-0010/0011

## Where things stand

- **Branch:** `fix/005-fix-found-bugs` (PR #47).
- **Pushed, and CI green on `b90b7ed`** (labeler, ci incl. e2e-ci, codeql, deploy-preview).
- **Committed locally, not pushed** (newest first):
  - `docs(session)` commit: this handoff, plus the two 2026-11-26 handoffs that had been left untracked
  - ADR renumbering commit: ADR-0009/0010 moved to 0010/0011 (see Decisions)
  - `353e9a5`, `8514a75` docs(adr): the two ADRs and their `CLAUDE.md` index lines
- **Uncommitted, leave alone:** `docs/security/` (findings docs, never committed by instruction),
  `.github/workflows/cerebrofy-arch.yml` (not ours).
- **Local machine:** the infra docker stack is stopped. Restart with `docker compose -p infra start`.

## Done this session (all pushed unless noted)

| Commit | What |
| --- | --- |
| `a7c0fa7` | SSRF: host-check every CalDAV hop and redirect, not only the typed URL |
| `19e21aa` | Host check judges IPv6 in canonical form |
| `a7aea7f` | N+1 queries batched in jobs, routes and services |
| `6c8ab99` | Migration 0016: indexes on searched and sorted columns |
| `17c8edb` | Global flag rows cached 60 s; exact-date fx rates memoised |
| `b90b7ed` | Optimistic edit, delete, restore, widget delete, unit switch (rollback + rethrow) |
| `8514a75`, `353e9a5` | ADRs (local only) |

"Lazy-load every image below the fold" needed no change: the only image
(`apps/landing/src/pages/index.vue:41`) already has `loading="lazy"`, width and height.

## Decisions and why

- **ADR-0010 in-process cache:** no KV/Redis (new service, no fresher), no LISTEN/NOTIFY (Workers can't
  listen). Cost: a `flags --global` change takes up to 60 s to reach other processes.
- **ADR-0011 outbound host policy:** every user-influenced hop must be https to a public address.
  On Workers the check is skipped on the untested assumption that Workers can't reach private
  addresses; T044 (cut-over) must confirm it. DNS-rebinding window is a known `ponytail:` gap.
- **ADR numbering:** spec 007 (`feature/007-lensed-backdrop`, pushed) reserves ADR-0009 for
  "WebGL background preset", accepted by Rostom 2026-11-26 but not yet written (its T001). So this
  session's ADRs are 0010 and 0011. When 007 merges, 0009 fills in.
- **Handoffs are now committed** (new rule in `CLAUDE.md` Conventions, 2026-11-27). The two
  2026-11-26 handoffs say "untracked on purpose"; that is superseded.

## Known bugs and flaky tests

- e2e-ci `tests/e2e/tests/today.spec.ts:381` (reconnect notice) and `:415` (T058 idle purge) timed
  out in `waitForTodayPayload` on `17c8edb`, passed on rerun and on `b90b7ed`. Flaky under load;
  investigate if they recur.
- One moderate Dependabot alert on `main`, pre-existing, not investigated.

## Open questions for Rostom

- Is 60 s acceptable for a global flag change, or shorten / drop the flag cache?
- Want a guard test that every below-the-fold `<img>` keeps `loading="lazy"`?
- Push the local commits (ADRs, handoffs)?

## Exact next step

Nothing in progress. On Rostom's ask, push `fix/005-fix-found-bugs` and watch CI; otherwise take
the next request. The session ran to about $180, so start a fresh one.
