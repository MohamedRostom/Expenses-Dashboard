# Notion integration (spec 005, BUG-001)

Notion sync uses Notion's public OAuth, so each deployed environment needs its own client ID and secret from a Notion public integration. Until they are set, the server answers `/notion/*` with `503 feature_unavailable` and Connectors shows "Notion sync isn't available on this server yet." with Connect disabled. This runbook is the owner step (T026): Rostom creates the integration and adds four repo secrets; nothing here has been executed by an agent.

## Create the public integration

In Notion, open Settings, then Connections, then Develop or manage integrations, and create a new integration of type **Public**. Use these values:

- Name: "Desk" (the working name; rename it when ADR-0002 settles the product name, since users see it on Notion's consent screen).
- Logo: any square image of at least 512 px; the product has no final logo yet, so a placeholder is acceptable for beta.
- Website, privacy policy and terms of service URLs: Notion requires all three for a public integration. Point them at pages that exist at the time (the landing site is unpublished, so use the repository's privacy and terms documents on a reachable URL, and update them when the landing site goes live).
- Redirect URIs, both registered on the one integration: `https://ros-desk-staging.fly.dev/notion/callback` and `https://ros-desk-production.fly.dev/notion/callback`.
- Capabilities: read content, update content and insert content. No user information beyond the workspace is needed.

Notion then shows an OAuth client ID and an OAuth client secret. If separate staging and production integrations are preferred, create two, each with only its own redirect URI.

## Add the four repo secrets

In the repository's Settings, Secrets and variables, Actions, add `STAGING_NOTION_CLIENT_ID`, `STAGING_NOTION_CLIENT_SECRET`, `PRODUCTION_NOTION_CLIENT_ID` and `PRODUCTION_NOTION_CLIENT_SECRET`. The deploy workflows (`deploy-staging.yml` and `deploy-fly.yml`) stage them on the Fly app next to the Resend secrets, only when both halves of a pair are set. Setting exactly one of a pair fails the deploy with an `::error::` message, because the API itself refuses to start with half a pair. Leaving both unset is valid and keeps that environment in the unavailable state.

The values reach the app after the next deploy: push to `main` for staging, or tag `v0.*` for staging then production. Afterwards open `/settings/connectors` on the environment; Connect should be enabled. The `@local` round trip in `tests/e2e/tests/notion.spec.ts` then verifies it on `desk-local` and logs the connect time for SC-001.2; it needs `NOTION_TEST_ACCOUNT_SECRET` in the `local-secrets` environment and a browser profile on the runner that is signed into a Notion test account.

## Previews stay unavailable by design

Preview apps have a different hostname for every pull request, and Notion only redirects to registered URIs, so a preview cannot complete a real connect. The preview workflow sets no Notion credentials, and previews show the unavailable state. Connect, disconnect and the error states are exercised against the mocked Notion in e2e-ci instead, and the `ci-no-notion` Playwright project (stack started with `infra/docker-compose.no-notion.yml`) proves the unavailable state itself.

## Tracking

The owner task is tracked in a GitHub issue labelled `needs-rostom`, to be created by Rostom or when he asks. Close it once staging shows Connect enabled and the `@local` test passes.
