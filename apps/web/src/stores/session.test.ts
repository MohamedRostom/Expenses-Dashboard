import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as ClientModule from '../api/client.js';
import { ApiError } from '../api/client.js';
import { useSessionStore, type User } from './session.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../api/client.js');
  return { ...actual, apiFetch: vi.fn() };
});

const CACHE_KEY = 'desk_cached_user';

const user: User = {
  id: 'u1',
  email: 'a@b.com',
  defaultCurrency: 'GBP',
  theme: 'system',
  timeZone: 'UTC',
};

describe('session store (C8: offline cold start)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('caches the user to localStorage on a successful load', async () => {
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockResolvedValue({ user });

    const session = useSessionStore();
    await session.load();

    expect(session.user).toEqual(user);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual(user);
  });

  it('unwraps the { user } envelope GET /me returns, not the envelope itself', async () => {
    const onboarded = { ...user, onboardingCompletedAt: '2026-09-19T00:00:00.000Z' };
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockResolvedValue({ user: onboarded });

    const session = useSessionStore();
    await session.load();

    // Regression for the double-wrap bug: session.user must be the flat User, so a field like
    // onboardingCompletedAt is readable directly — not nested under session.user.user.
    expect(session.user).toEqual(onboarded);
    expect(session.user?.onboardingCompletedAt).toBe('2026-09-19T00:00:00.000Z');
    expect((session.user as Record<string, unknown> | null)?.['user']).toBeUndefined();
  });

  it('falls back to the cached user on a network error instead of throwing', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockRejectedValue(new TypeError('Failed to fetch'));

    const session = useSessionStore();
    await expect(session.load()).resolves.toBeUndefined();
    expect(session.user).toEqual(user);
  });

  it('still throws on a network error with no cache to fall back to', async () => {
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockRejectedValue(new TypeError('Failed to fetch'));

    const session = useSessionStore();
    await expect(session.load()).rejects.toBeInstanceOf(TypeError);
  });

  it('a 401 clears the user and the cache, not falls back to it', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockRejectedValue(new ApiError('unauthenticated', 'no session', 401));

    const session = useSessionStore();
    await session.load();

    expect(session.user).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
