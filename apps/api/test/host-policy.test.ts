// Security review 2026-11-26 (SSRF): the CalDAV client calls assertPublicUrl before every hop,
// so a server-chosen href or redirect can't reach a private address.
import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPublicAddress, type HostResolver } from '../src/lib/host-policy.js';

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
    // Review 2: the URL parser rewrites mapped literals to hex (::ffff:7f00:1).
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:a00:5]/',
  ])('refuses a private host: %s', async (url) => {
    await expect(check(url)).rejects.toThrow();
  });

  it('refuses plain http, so Basic-auth credentials never leave over cleartext', async () => {
    await expect(check('http://caldav.example.com/')).rejects.toThrow();
  });

  it('refuses a host that resolves to nothing', async () => {
    await expect(assertPublicUrl(async () => [])('https://caldav.example.com/')).rejects.toThrow();
  });

  it('refuses a host that does not resolve', async () => {
    const failing = assertPublicUrl(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(failing('https://nowhere.example.com/')).rejects.toThrow();
  });
});

// Security review 2 (2026-11-26): every spelling of an IPv6 address is judged by what it means.
// The IMAP host reaches isPublicAddress raw (no URL parsing), so any spelling can arrive.
describe('isPublicAddress: IPv6 spellings', () => {
  it.each([
    '::ffff:a00:5', // 10.0.0.5, hex mapped form
    '::ffff:7f00:1', // 127.0.0.1
    '::FFFF:127.0.0.1', // dotted mapped form, upper case
    '0:0:0:0:0:ffff:a9fe:a9fe', // 169.254.169.254, expanded
    '0:0:0:0:0:0:0:1', // loopback, expanded
    '::7f00:1', // deprecated IPv4-compatible ::/96
    'fe80::1%eth0', // zone id: not a plain literal
    'not-an-ip',
  ])('%s is not public', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([
    '::ffff:5db8:d822', // 93.184.216.34, mapped
    '2606:4700:4700::1111',
  ])('%s is public', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});
