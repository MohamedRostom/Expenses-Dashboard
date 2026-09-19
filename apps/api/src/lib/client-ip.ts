// The first X-Forwarded-For entry is whatever the client itself sent — trivially spoofable to
// dodge a per-IP rate limit. Fly and Cloudflare both set their own header with the address they
// actually saw; fall back to the LAST XFF entry (the hop closest to us) only if neither is
// present, never the first.
// null (not 'unknown') when nothing is present — callers that store this in an `inet` column
// need a real null, not a string Postgres can't cast; callers that only build a rate-limit key
// string do `clientIp(c) ?? 'unknown'`.
export function clientIp(c: { req: { header(name: string): string | undefined } }): string | null {
  const flyIp = c.req.header('fly-client-ip');
  if (flyIp) return flyIp;
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim());
    return parts[parts.length - 1] || null;
  }
  return null;
}
