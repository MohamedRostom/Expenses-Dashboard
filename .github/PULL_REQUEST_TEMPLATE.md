## What

<!-- One paragraph: what changes and why. Link the issue. -->

## Tests first

<!-- Which test proves this change? Point the reviewer at it before the change itself. -->

## Definition of done

- [ ] Unit and API tests added or updated
- [ ] e2e-ci scenario added or updated (or not applicable, say why)
- [ ] `CHANGELOG.md` line added
- [ ] Coverage not lower than `main`
- [ ] Lighthouse budgets green (perf ≥ 90, a11y ≥ 95) where a page changed
- [ ] Preview URL visited by the author
- [ ] No new dependency, or it passes `worker-build` (or is wrapped behind an interface)
- [ ] No secrets committed; `.env.example` updated if a variable was added
