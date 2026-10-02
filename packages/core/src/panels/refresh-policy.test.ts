import { describe, expect, it } from 'vitest';
import {
  tierFor,
  nextDueAt,
  statusAfterFailures,
  shouldRefreshOnOpen,
  ERROR_AFTER_FAILURES,
} from './refresh-policy.js';

describe('refresh-policy', () => {
  describe('tierFor', () => {
    it('returns "active" when lastActiveAt is within 24 hours', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastActiveAt = new Date('2026-09-25T12:00:00Z'); // exactly 24h ago
      expect(tierFor(lastActiveAt, now)).toBe('active');
    });

    it('returns "active" when lastActiveAt is within 24 hours (less than)', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastActiveAt = new Date('2026-09-26T11:59:59Z'); // 1s ago
      expect(tierFor(lastActiveAt, now)).toBe('active');
    });

    it('returns "idle" when lastActiveAt is older than 24 hours', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastActiveAt = new Date('2026-09-25T11:59:59Z'); // 24h1s ago
      expect(tierFor(lastActiveAt, now)).toBe('idle');
    });

    it('returns "idle" when lastActiveAt is null', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      expect(tierFor(null, now)).toBe('idle');
    });
  });

  describe('nextDueAt', () => {
    it('returns 5 minutes after lastRefreshAt for active tier with 0 failures', () => {
      const lastRefreshAt = new Date('2026-09-26T12:00:00Z');
      const next = nextDueAt('active', lastRefreshAt, 0);
      expect(next.getTime() - lastRefreshAt.getTime()).toBe(5 * 60 * 1000);
    });

    it('returns 1 hour after lastRefreshAt for idle tier with 0 failures', () => {
      const lastRefreshAt = new Date('2026-09-26T12:00:00Z');
      const next = nextDueAt('idle', lastRefreshAt, 0);
      expect(next.getTime() - lastRefreshAt.getTime()).toBe(60 * 60 * 1000);
    });

    it('doubles the interval per consecutive failure', () => {
      const lastRefreshAt = new Date('2026-09-26T12:00:00Z');

      // active: 5, 10, 20, 40, 60, 60 min...
      expect(nextDueAt('active', lastRefreshAt, 1).getTime() - lastRefreshAt.getTime()).toBe(
        10 * 60 * 1000,
      );
      expect(nextDueAt('active', lastRefreshAt, 2).getTime() - lastRefreshAt.getTime()).toBe(
        20 * 60 * 1000,
      );
      expect(nextDueAt('active', lastRefreshAt, 3).getTime() - lastRefreshAt.getTime()).toBe(
        40 * 60 * 1000,
      );
      expect(nextDueAt('active', lastRefreshAt, 4).getTime() - lastRefreshAt.getTime()).toBe(
        60 * 60 * 1000,
      );
      expect(nextDueAt('active', lastRefreshAt, 5).getTime() - lastRefreshAt.getTime()).toBe(
        60 * 60 * 1000,
      );
    });

    it('caps the interval at 1 hour for active tier', () => {
      const lastRefreshAt = new Date('2026-09-26T12:00:00Z');
      const next = nextDueAt('active', lastRefreshAt, 10);
      expect(next.getTime() - lastRefreshAt.getTime()).toBe(60 * 60 * 1000);
    });

    it('doubles the interval per failure for idle tier', () => {
      const lastRefreshAt = new Date('2026-09-26T12:00:00Z');

      // idle: 60, 120, 240... capped at 60
      expect(nextDueAt('idle', lastRefreshAt, 1).getTime() - lastRefreshAt.getTime()).toBe(
        60 * 60 * 1000,
      );
      expect(nextDueAt('idle', lastRefreshAt, 2).getTime() - lastRefreshAt.getTime()).toBe(
        60 * 60 * 1000,
      );
    });
  });

  describe('statusAfterFailures', () => {
    it('returns "connected" when failures < 20', () => {
      expect(statusAfterFailures(0)).toBe('connected');
      expect(statusAfterFailures(1)).toBe('connected');
      expect(statusAfterFailures(19)).toBe('connected');
    });

    it('returns "error" when failures >= 20', () => {
      expect(statusAfterFailures(20)).toBe('error');
      expect(statusAfterFailures(21)).toBe('error');
      expect(statusAfterFailures(100)).toBe('error');
    });

    it('exports ERROR_AFTER_FAILURES = 20', () => {
      expect(ERROR_AFTER_FAILURES).toBe(20);
    });
  });

  describe('shouldRefreshOnOpen', () => {
    it('returns true when lastRefreshAt is null', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      expect(shouldRefreshOnOpen(null, now)).toBe(true);
    });

    it('returns true when older than 2 minutes', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastRefreshAt = new Date('2026-09-26T11:57:59Z'); // 2m1s ago
      expect(shouldRefreshOnOpen(lastRefreshAt, now)).toBe(true);
    });

    it('returns false when within 2 minutes', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastRefreshAt = new Date('2026-09-26T11:58:01Z'); // 1m59s ago
      expect(shouldRefreshOnOpen(lastRefreshAt, now)).toBe(false);
    });

    it('returns false when exactly 2 minutes old', () => {
      const now = new Date('2026-09-26T12:00:00Z');
      const lastRefreshAt = new Date('2026-09-26T11:58:00Z'); // exactly 2min ago
      expect(shouldRefreshOnOpen(lastRefreshAt, now)).toBe(false);
    });
  });
});
