# Visual snapshots

`@visual` tests (Playwright project `visual`) compare screenshots against baselines committed
next to each spec in `tests/e2e/tests/*.spec.ts-snapshots/`. They only run inside
`mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` is the exact
`@playwright/test` version in `tests/e2e/package.json`. A browser installed on the host must
never render a baseline: fonts and anti-aliasing differ, and the 0.5 % tolerance is tuned for
the image (research R6). The host-run projects (`ci`, `pixel-7`, `iphone-14`) skip `@visual`.

Rules for `@visual` tests: one viewport per image (no `fullPage`; use element snapshots for
content below the fold), and no `psql()` from `tests/e2e/fixtures/index.ts`, because it uses
`docker exec` and the container has no Docker socket.

## Updating baselines in CI

1. Actions, `update-snapshots`, Run workflow on the branch. It brings up the compose stack,
   switches the flags on and runs `--project=visual --update-snapshots` in the image.
2. Download the `visual-snapshots` artifact. It contains every `*.spec.ts-snapshots/`
   directory and `apps/landing/public/screenshots/` (the landing page's PNGs and `manifest.json`, written by `screenshots.spec.ts` through the `screenshots` project), at their repo paths.
3. Unzip over the working tree, review the changed images, commit them. The `visual` job in
   `ci.yml` then compares against them on every PR.

## Updating baselines locally (Docker Desktop)

Start the stack (`docker compose -f infra/docker-compose.yml up --build --wait`, flags on as
in `ci.yml`), then, from the repo root (PowerShell users: use `${PWD}` and backticks):

```sh
V=$(node -p "require('./tests/e2e/package.json').devDependencies['@playwright/test']")
P=$(node -p "require('./package.json').packageManager.split('@')[1]")
docker run --rm --ipc=host \
  -v "$PWD:/work" -v /work/node_modules -v /work/tests/e2e/node_modules -w /work \
  -e E2E_BASE_URL=http://localhost:5173 \
  -e MAILPIT_URL=http://localhost:8025 \
  -e MOCKS_URL=http://localhost:4000 \
  -e CI=true \
  mcr.microsoft.com/playwright:v$V-noble \
  bash -lc "npx -y pnpm@$P install --frozen-lockfile --filter @desk/e2e... && cd tests/e2e && npx playwright test --project=visual --update-snapshots"
```

`--network host` (Docker Desktop 4.34+ with host networking enabled) makes the stack reachable
as `localhost`. With `host.docker.internal` Vite rejects the Host header ("Blocked request") and
the API's `APP_ORIGIN` (`http://localhost:5173`) would not match either. Add a spec filter such
as `year` after `--project=visual` to render one file only.

Drop `--update-snapshots` to compare only. The anonymous volumes keep the container's
`node_modules` separate from the host's, so nothing the container installs leaks onto Windows.
