/** Normalises a description for fingerprinting: lowercase, trim, strip punctuation, collapse
 * whitespace. Not exported — callers only need the resulting fingerprint. */
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** SHA-256 hex digest of `date|amountMinor|currency|normalizedDescription`, used to detect
 * duplicate rows on import (research.md R12). WebCrypto (`crypto.subtle`) is available as a
 * global in both Node 22 and Cloudflare Workers — no import needed, keeps packages/core
 * platform-neutral. */
export async function fingerprint(
  date: string,
  amountMinor: number,
  currency: string,
  description: string,
): Promise<string> {
  const normalized = normalizeDescription(description);
  const input = `${date}|${amountMinor}|${currency}|${normalized}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
