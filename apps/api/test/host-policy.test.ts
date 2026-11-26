// Security review 2026-11-26 (SSRF): the CalDAV client calls assertPublicUrl before every hop,
// so a server-chosen href or redirect can't reach a private address.
import { describe, expect, it } from 'vitest';
import { assertPublicUrl, type HostResolver } from '../src/lib/host-policy.js';

const resolver: HostResolver = async (hostname) =>
  ({ 'caldav.example.com': ['93.184.216.34'], 'evil.example.com': ['10.0.0.5'] })[hostname] ?? [
    hostname.replace(/^\[|\]$/g, ''),
  ];

describe('assertPublicUrl', () => {
  const check = assertPublicUrl(resolver);

  it('allows an https URL on a public host', async () => {
    await expect(check('https://caldav.example.com/dav/')).resolves.toBeUndefined();
  });

  it.each([
    'https://evil.example.com/', // name resolving to a private address
    'https://169.254.169.254/latest/meta-data/', // link-local / metadata literal
    'https://[fdaa::3]/', // Fly 6PN literal
  ])('refuses a private host: %s', async (url) => {
    await expect(check(url)).rejects.toThrow();
  });

  it('refuses plain http, so Basic-auth credentials never leave over cleartext', async () => {
    await expect(check('http://caldav.example.com/')).rejects.toThrow();
  });

  it('refuses a host that does not resolve', async () => {
    const failing = assertPublicUrl(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(failing('https://nowhere.example.com/')).rejects.toThrow();
  });
});
