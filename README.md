# Desk (working name) — Expenses Dashboard

A public, multi-user, multi-currency expense tracker with optional two-way Notion sync and webhook auto-capture. TypeScript monorepo: Vue 3 front end, Hono API that runs on Node (Fly.io) and Cloudflare Workers, Postgres via Drizzle.

Read `CLAUDE.md` for the decisions, `docs/ROADMAP.md` for what comes next and `docs/adr/` for why.

## Run it

Requires Node 22 and pnpm 12 (`npm i -g pnpm@12`). Docker for the compose stack and the API tests.

```sh
pnpm install
cp .env.example .env               # point DATABASE_URL at a Postgres 16
pnpm db:migrate                    # applies packages/db/migrations
pnpm dev                           # api on :3000, web on :5173 (proxies /healthz)
```

Or the whole stack in containers:

```sh
docker compose -f infra/docker-compose.yml up --build --wait
```

## Check it

```sh
pnpm lint && pnpm typecheck        # also run on staged files by the pre-commit hook
pnpm test:unit                     # packages/core, Vitest, coverage floor 85 %
pnpm test:api                      # apps/api, Vitest + Testcontainers Postgres
pnpm worker:build                  # wrangler deploy --dry-run: proves the Worker bundle
pnpm test:e2e -- --project=ci      # Playwright against the compose stack on :5173
```

CI runs the same chain on every PR, deploys a Fly preview app per PR, and deploys `main` to `desk-staging.fly.dev`.
