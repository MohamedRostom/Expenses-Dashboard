# ADR-0011: Check every outbound host a user can choose

**Status:** Accepted
**Date:** 2026-11-27 (the code landed 2026-11-26)
**Deciders:** Rostom (owner)
**Relates to:** ADR-0004 (standards-based panels), FR-017 in `specs/002-mail-calendar-panels/`,
commits `a7c0fa7` and `19e21aa`, cut-over task T044 (`docs/runbooks/cutover.md`)

## Context

Standards-based connections let a user type any CalDAV server address. The API then fetches from
it at connect time and again on every `panels.refresh`. The first version checked only the
address the user typed. The 2026-11-26 security review showed that was not enough: CalDAV
discovery follows absolute `<D:href>` links the server chooses, and `fetch` followed redirects
on its own. A server on a public address could therefore send the API to a private one, such as
a Fly 6PN peer or a cloud metadata endpoint (SSRF). IPv6 literals written in non-canonical form
slipped past the address check as well.

## Decision

Every request to a host a user can influence is checked before it is sent, not just the first:

- `assertPublicUrl` (`apps/api/src/lib/host-policy.ts`) requires `https` and a host that resolves
  only to public addresses. It refuses loopback, private (RFC 1918), link-local, CGNAT,
  unique-local (Fly's `fdaa::/16` included) and IPv4-mapped forms of those, judging IPv6 in
  canonical form.
- The CalDAV client runs it before every request (`CalDavConfig.assertUrl`). Redirects are
  followed by hand (`redirect: 'manual'`, at most five), checking each `Location` first.
- On Node it is wired in `app.ts` with a `node:dns` resolver. On Workers there is no resolver,
  so the per-hop check is skipped, on the basis that Workers cannot reach private networks.
- `STANDARDS_ALLOW_PRIVATE_HOSTS` turns the check off so e2e-ci can reach the compose mocks.
  `env.ts` refuses that variable on any Fly deployment.

Any future connector that fetches a user-chosen URL follows the same rule.

## Alternatives Considered

### Check only the URL the user typed
- **Pros:** one check, no changes to the CalDAV client.
- **Cons:** server-chosen hrefs and redirects bypass it.
- **Why not:** the security review demonstrated the bypass.

### An egress proxy that blocks private ranges
- **Pros:** covers every outbound call, including connectors not written yet, and closes the
  DNS-rebinding gap.
- **Cons:** another service to run and pay for on Stage 1, and Workers doesn't need it.
- **Why not:** too much infrastructure for one connector today. Revisit it if more connectors
  begin fetching user-chosen URLs.

## Consequences

### Positive
- A malicious CalDAV server can no longer steer the API to internal addresses on Fly.
- The policy is pure and Workers-compatible; only the DNS lookup sits behind an adapter.

### Negative
- The address is resolved for the check, then `fetch` resolves it again. A host that changes its
  DNS answer in that window (DNS rebinding) can still slip through. This is marked `ponytail:` in
  `host-policy.ts`; the fix is to connect to the IP the check resolved.
- Each hop now costs a DNS lookup.

### Risks
- **The Workers skip rests on an assumption nothing tests:** that a Worker's `fetch` cannot reach
  a private address. T044 must confirm it before the Cloudflare cut-over, or give Workers a
  resolver (DNS over HTTPS) so the check runs there too.
- A new connector that forgets the rule reopens the hole. Code review should ask for this ADR
  whenever a fetch target comes from user input or from a remote server's response.
