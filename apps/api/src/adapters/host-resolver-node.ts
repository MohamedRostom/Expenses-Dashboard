// Node adapter for HostResolver (apps/api/src/lib/host-policy.ts) — the only file besides
// socket-node.ts allowed to import a node:* DNS module (CLAUDE.md/brief: node:dns only in an
// adapter, never in services). node:dns/promises.lookup resolves both hostnames and IP literals
// (an IP literal is returned unchanged, no network round-trip), so createStandards never needs to
// special-case "the host field is already an IP".
import { lookup } from 'node:dns/promises';
import type { HostResolver } from '../lib/host-policy.js';

export const resolveHostNode: HostResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};
