/**
 * FR-017: standards-based connections may only reach public internet hosts. This file is pure
 * (no I/O, Workers-compatible) — the actual DNS lookup lives behind `HostResolver`, implemented
 * by a real adapter (node:dns, apps/api/src/adapters/host-resolver-node.ts) or a fake in tests.
 */

/** Resolves a hostname (or IP literal) to every address it answers to. */
export type HostResolver = (hostname: string) => Promise<string[]>;

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return false; // "this network"
  if (a === 127) return false; // loopback
  if (a === 10) return false; // private (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return false; // private (RFC 1918)
  if (a === 192 && b === 168) return false; // private (RFC 1918)
  if (a === 169 && b === 254) return false; // link-local
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (RFC 6598)
  return true;
}

function isPublicIPv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return false; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded IPv4 address.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(norm);
  if (mapped) return isPublicIPv4(mapped[1]!);
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return false; // link-local, fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return false; // unique local, fc00::/7 (incl. Fly's fdaa::/16)
  return true;
}

/** True when `ip` (an IPv4 or IPv6 literal, as `HostResolver` returns) is a public address —
 * false for loopback, private, link-local, CGNAT, unique-local/platform-internal ranges. */
export function isPublicAddress(ip: string): boolean {
  return IPV4_RE.test(ip) ? isPublicIPv4(ip) : isPublicIPv6(ip);
}
