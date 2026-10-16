# Announcing background motion (`appearance.motion`)

The panel look ships unflagged; the four appearance controls and the moving background layer sit
behind `appearance.motion`, off in production until Rostom announces it (ADR-0007, spec 006). There
is no general release runbook, so this is its own page. Do the steps in order.

1. Turn the flag on for everyone: `pnpm flags set appearance.motion on` against the production
   database (see `docs/runbooks/` for the usual connection setup). The web app and the sign-in,
   sign-up and reset pages pick it up on the next `GET /flags/public` or `GET /flags`; no redeploy.
2. Set the repository variable: `gh variable set APPEARANCE_MOTION --body true`. The landing site
   reads the flag when it is built, not at runtime, so this is the only way it reaches the landing
   page. Unset (or any other value) means off.
3. Redeploy the landing site: re-run the latest `deploy-staging` run on `main` in GitHub Actions (the
   `deploy-landing` job, which needs `LANDING_ENABLED` to be `true`), or push to `main`. The job passes the variable to the
   build as `VITE_APPEARANCE_MOTION`.
4. Check the landing page shows Particles (the `<html>` tag carries `data-motion="particles"`) and
   that Lighthouse still scores performance 90 or more and accessibility 95 or more.

To switch it off again, reverse the order: `gh variable set APPEARANCE_MOTION --body false`,
redeploy the landing site, then `pnpm flags set appearance.motion off`.
