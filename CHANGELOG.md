# Changelog

All notable changes to this project are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Unreleased changes sit at the top until a tag is cut.

## [Unreleased]

### Added

- Phase 0 foundation: pnpm monorepo (`apps/web`, `apps/api`, `packages/*`, `tests/e2e`), `/healthz` and the Hello page, `users` migration, Docker and compose stack, Fly and Cloudflare configs, CI pipeline (lint → typecheck → unit → api → worker-build → e2e-ci), Fly preview per PR, staging deploy from `main`, e2e-local skeleton, repo hygiene (PR template, CODEOWNERS, Dependabot, CodeQL, SECURITY.md, `.env.example` with startup validation), ADR-0001 and draft ADR-0002.
