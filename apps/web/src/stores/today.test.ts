import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type * as ClientModule from '../api/today.js';
import type { TodayResponseT } from '@desk/contracts';
import { ApiError } from '../api/client.js';

vi.mock('../api/today.js', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../api/today.js');
  return { ...actual, getToday: vi.fn(), postTodayRefresh: vi.fn() };
});

describe('Today store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseAccount: TodayResponseT['accounts'][0] = {
    id: 'acc1',
    provider: 'google',
    label: 'Work',
    colour: '#1f6e5a',
    capabilities: ['calendar', 'mail'],
    status: 'connected',
    lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
    lastError: null,
    stale: false,
    purged: false,
    unreadCount: 0,
  };

  const mockPayload: TodayResponseT = {
    days: [{ date: '2026-09-26', events: [] }],
    messages: [],
    accounts: [baseAccount],
    generatedAt: new Date().toISOString(),
  };

  describe('load()', () => {
    it('fetches GET /today and stores the payload', async () => {
      const { getToday } = await import('../api/today.js');
      vi.mocked(getToday).mockResolvedValue(mockPayload);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();

      expect(store.loading).toBe(false);
      await store.load();

      expect(getToday).toHaveBeenCalledOnce();
      expect(store.payload).toEqual(mockPayload);
      expect(store.loading).toBe(false);
    });

    it('sets loading to true while fetching', async () => {
      const { getToday } = await import('../api/today.js');
      let resolveApi: (value: TodayResponseT) => void = () => {};
      const promise = new Promise<TodayResponseT>((resolve) => {
        resolveApi = resolve;
      });
      vi.mocked(getToday).mockReturnValue(promise);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();

      const loadPromise = store.load();
      expect(store.loading).toBe(true);

      resolveApi(mockPayload);
      await loadPromise;

      expect(store.loading).toBe(false);
    });

    it('sets error when fetch fails', async () => {
      const { getToday } = await import('../api/today.js');
      const error = new ApiError('internal', 'Server error', 500);
      vi.mocked(getToday).mockRejectedValue(error);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();

      await expect(store.load()).rejects.toThrow();
      expect(store.error).toBe('internal');
    });
  });

  describe('refreshIfStale()', () => {
    it('does nothing when all accounts have fresh lastRefreshAt', async () => {
      const { postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:10:00Z');

      const freshPayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:09:00Z').toISOString(),
          },
        ],
      };

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = freshPayload;

      await store.refreshIfStale(now);

      expect(postTodayRefresh).not.toHaveBeenCalled();
    });

    it('calls POST /today/refresh when some account is older than two minutes', async () => {
      const { postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:05:00Z');

      const stalePayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
          },
        ],
      };

      vi.mocked(postTodayRefresh).mockResolvedValue({ queued: ['acc1'] });

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = stalePayload;

      await store.refreshIfStale(now);

      expect(postTodayRefresh).toHaveBeenCalledOnce();
    });

    it('calls POST /today/refresh when an account has null lastRefreshAt', async () => {
      const { postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:10:00Z');

      const payloadWithNull: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: null,
          },
        ],
      };

      vi.mocked(postTodayRefresh).mockResolvedValue({ queued: ['acc1'] });

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = payloadWithNull;

      await store.refreshIfStale(now);

      expect(postTodayRefresh).toHaveBeenCalledOnce();
    });

    it('does nothing when payload is null', async () => {
      const { postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:10:00Z');

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();

      await store.refreshIfStale(now);

      expect(postTodayRefresh).not.toHaveBeenCalled();
    });

    it('sets retryAfterSeconds on 429 without treating it as an error', async () => {
      const { postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:05:00Z');

      const stalePayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
          },
        ],
      };

      const rateLimitError = new ApiError('rate_limited', 'Too many requests', 429, {
        retryAfterSeconds: 60,
      });
      vi.mocked(postTodayRefresh).mockRejectedValue(rateLimitError);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = stalePayload;

      await store.refreshIfStale(now);

      expect(store.retryAfterSeconds).toBe(60);
      expect(store.error).toBeNull();
    });
  });

  describe('polling', () => {
    it('does not start polling when all accounts are fresh', async () => {
      const { getToday, postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:10:00Z');

      const freshPayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:09:00Z').toISOString(),
          },
        ],
      };

      vi.mocked(getToday).mockResolvedValue(mockPayload);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = freshPayload;

      await store.refreshIfStale(now);

      // No refresh call should have been made
      expect(postTodayRefresh).not.toHaveBeenCalled();

      // No polling should start, so getToday should not be called
      await vi.advanceTimersByTimeAsync(120_000);
      expect(getToday).not.toHaveBeenCalled();
    });

    it('polls every 10s for 30s, then every 60s with exact call counts', async () => {
      const { getToday, postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:05:00Z');

      const stalePayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
          },
        ],
      };

      vi.mocked(postTodayRefresh).mockResolvedValue({ queued: ['acc1'] });
      vi.mocked(getToday).mockResolvedValue(mockPayload);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = stalePayload;

      await store.refreshIfStale(now);
      vi.mocked(getToday).mockClear();

      // t = 9.999s: no poll yet
      await vi.advanceTimersByTimeAsync(9_999);
      expect(getToday).toHaveBeenCalledTimes(0);

      // t = 10s: first poll
      await vi.advanceTimersByTimeAsync(1);
      expect(getToday).toHaveBeenCalledTimes(1);

      // t = 20s: second poll
      await vi.advanceTimersByTimeAsync(10_000);
      expect(getToday).toHaveBeenCalledTimes(2);

      // t = 30s: third poll
      await vi.advanceTimersByTimeAsync(10_000);
      expect(getToday).toHaveBeenCalledTimes(3);

      // t = 89.999s: still 3 (next poll at 90s)
      await vi.advanceTimersByTimeAsync(59_999);
      expect(getToday).toHaveBeenCalledTimes(3);

      // t = 90s: fourth poll
      await vi.advanceTimersByTimeAsync(1);
      expect(getToday).toHaveBeenCalledTimes(4);

      // t = 150s: fifth poll
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getToday).toHaveBeenCalledTimes(5);
    });

    it('pauses polling when hidden and resumes when visible with exact counts', async () => {
      const { getToday, postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:05:00Z');

      const stalePayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
          },
        ],
      };

      vi.mocked(postTodayRefresh).mockResolvedValue({ queued: ['acc1'] });
      vi.mocked(getToday).mockResolvedValue(mockPayload);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = stalePayload;

      await store.refreshIfStale(now);
      vi.mocked(getToday).mockClear();

      // Advance to 30s: 3 polls at 10s, 20s, 30s
      await vi.advanceTimersByTimeAsync(30_000);
      expect(getToday).toHaveBeenCalledTimes(3);

      // Hide at t=30s
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();

      // Advance 5 minutes while hidden - should stay at 3
      await vi.advanceTimersByTimeAsync(300_000);
      expect(getToday).toHaveBeenCalledTimes(3);

      // Make visible at t=330s
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();

      // Next 60s poll should happen at t=390s
      // But we're at t=330s, so need to advance 60s to t=390s
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getToday).toHaveBeenCalledTimes(4);
    });
  });

  describe('stop()', () => {
    it('stops polling and no calls happen after stop', async () => {
      const { getToday, postTodayRefresh } = await import('../api/today.js');
      const now = new Date('2026-09-26T10:05:00Z');

      const stalePayload: TodayResponseT = {
        ...mockPayload,
        accounts: [
          {
            ...baseAccount,
            lastRefreshAt: new Date('2026-09-26T10:00:00Z').toISOString(),
          },
        ],
      };

      vi.mocked(postTodayRefresh).mockResolvedValue({ queued: ['acc1'] });
      vi.mocked(getToday).mockResolvedValue(mockPayload);

      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();
      store.payload = stalePayload;

      await store.refreshIfStale(now);
      vi.mocked(getToday).mockClear();

      // First poll at t=10s
      await vi.advanceTimersByTimeAsync(10_000);
      expect(getToday).toHaveBeenCalledTimes(1);

      // Stop at t=10s
      store.stop();

      // Fast-forward 10 minutes - should be no calls
      await vi.advanceTimersByTimeAsync(600_000);
      expect(getToday).toHaveBeenCalledTimes(1);
    });
  });

  describe('filterAccountId', () => {
    it('filters and returns messages correctly', async () => {
      const { useTodayStore } = await import('./today.js');
      const store = useTodayStore();

      const testPayload: TodayResponseT = {
        ...mockPayload,
        messages: [
          {
            id: 'm1',
            accountId: 'acc1',
            fromName: 'Alice',
            fromAddress: 'alice@example.com',
            subject: 'Test 1',
            preview: 'Preview 1',
            receivedAt: '2026-09-26T10:00:00Z',
            unread: true,
            link: null,
          },
          {
            id: 'm2',
            accountId: 'acc2',
            fromName: 'Bob',
            fromAddress: 'bob@example.com',
            subject: 'Test 2',
            preview: 'Preview 2',
            receivedAt: '2026-09-26T10:01:00Z',
            unread: false,
            link: null,
          },
        ],
      };

      store.payload = testPayload;

      // Filter to acc1
      store.filterAccountId = 'acc1';
      const filtered1 = store.visibleMessages;
      expect(Array.isArray(filtered1)).toBe(true);
      expect(filtered1.length).toBe(1);
      if (filtered1.length === 1 && filtered1[0]) {
        expect(filtered1[0].fromName).toBe('Alice');
      }

      // Filter to acc2
      store.filterAccountId = 'acc2';
      const filtered2 = store.visibleMessages;
      expect(filtered2.length).toBe(1);
      if (filtered2.length === 1 && filtered2[0]) {
        expect(filtered2[0].fromName).toBe('Bob');
      }

      // Show all
      store.filterAccountId = null;
      const all = store.visibleMessages;
      expect(all.length).toBe(2);
    });
  });
});
