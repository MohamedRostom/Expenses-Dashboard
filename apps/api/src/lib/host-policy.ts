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
  // Canonicalise first, so every spelling of one address looks the same: the URL parser lowercases,
  // compresses zeros and rewrites ::ffff:127.0.0.1 to ::ffff:7f00:1. Not a plain IPv6 literal
  // (garbage, zone id) = not public.
  let norm: string;
  try {
    norm = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return false;
  }
  // IPv4-mapped (::ffff:0:0/96) — judge the embedded IPv4 address.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(norm);
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  if (/^::([0-9a-f]{1,4}(:[0-9a-f]{1,4})?)?$/.test(norm)) return false; // ::/96: unspecified, loopback, IPv4-compatible
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return false; // link-local, fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return false; // unique local, fc00::/7 (incl. Fly's fdaa::/16)
  return true;
}

/** True when `ip` (an IPv4 or IPv6 literal, as `HostResolver` returns) is a public address —
 * false for loopback, private, link-local, CGNAT, unique-local/platform-internal ranges. */
export function isPublicAddress(ip: string): boolean {
  return IPV4_RE.test(ip) ? isPublicIPv4(ip) : isPublicIPv6(ip);
}

/** Per-request guard for the CalDAV client (CalDavConfig.assertUrl): https only, and the host must
 * resolve to public addresses only. Throws otherwise. Runs on every hop, not just the entry URL,
 * because the server picks later URLs (hrefs, redirects).
 * ponytail: resolve-then-fetch leaves a DNS-rebinding window; pin the resolved IP if that matters. */
export function assertPublicUrl(resolver: HostResolver): (url: string) => Promise<void> {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error(`not https: ${parsed.protocol}`);
    const addresses = await resolver(parsed.hostname.replace(/^\[|\]$/g, ''));
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a))) {
      throw new Error(`not a public host: ${parsed.hostname}`);
    }
  };
}
