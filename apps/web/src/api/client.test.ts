import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError, readCookie } from './client.js';

describe('readCookie', () => {
  it('returns null when the cookie is absent', () => {
    Object.defineProperty(document, 'cookie', { value: 'other=1', configurable: true });
    expect(readCookie('__Host-desk_csrf')).toBeNull();
  });

  it('reads a matching cookie value', () => {
    Object.defineProperty(document, 'cookie', {
      value: 'a=1; __Host-desk_csrf=tok123; b=2',
      configurable: true,
    });
    expect(readCookie('__Host-desk_csrf')).toBe('tok123');
  });
});

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'cookie', { value: '', configurable: true });
  });

  it('sends the CSRF header on non-GET requests', async () => {
    Object.defineProperty(document, 'cookie', {
      value: '__Host-desk_csrf=abc',
      configurable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/expenses', { method: 'POST', body: '{}' });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('abc');
  });

  it('does not send the CSRF header on GET requests', async () => {
    Object.defineProperty(document, 'cookie', {
      value: '__Host-desk_csrf=abc',
      configurable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/me');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBeNull();
  });

  it('throws ApiError parsed from the error envelope on a non-ok response', async () => {
    const body = JSON.stringify({ error: { code: 'unauthenticated', message: 'not logged in' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 401 })));

    await expect(apiFetch('/me')).rejects.toMatchObject(
      new ApiError('unauthenticated', 'not logged in', 401),
    );
  });
});
