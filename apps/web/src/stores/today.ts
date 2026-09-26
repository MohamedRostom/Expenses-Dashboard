import { defineStore } from 'pinia';
import type { TodayResponseT } from '@desk/contracts';
import { getToday, postTodayRefresh } from '../api/today.js';
import { ApiError } from '../api/client.js';
import { toPanelErrorKind, type PanelErrorKind } from '../utils/errors.js';

export const useTodayStore = defineStore('today', {
  state: () => ({
    payload: null as TodayResponseT | null,
    loading: false,
    error: null as PanelErrorKind | null,
    retryAfterSeconds: null as number | null,
    filterAccountId: null as string | null,
    _pollHandle: null as ReturnType<typeof setTimeout> | null,
    _visibilityHandler: null as ((e: Event) => void) | null,
  }),

  getters: {
    visibleMessages(): TodayResponseT['messages'] {
      if (!this.payload || !Array.isArray(this.payload.messages)) {
        return [];
      }
      if (!this.filterAccountId) {
        return this.payload.messages;
      }
      return this.payload.messages.filter((msg) => msg.accountId === this.filterAccountId);
    },
  },

  actions: {
    async load() {
      this.loading = true;
      this.error = null;
      try {
        this.payload = await getToday();
      } catch (err) {
        this.error = toPanelErrorKind(err);
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async refreshIfStale(now: Date) {
      if (!this.payload) return;

      const twoMinutesMs = 2 * 60 * 1000;
      const shouldRefresh = this.payload.accounts.some((acc) => {
        if (acc.lastRefreshAt === null) return true;
        const lastRefresh = new Date(acc.lastRefreshAt);
        return now.getTime() - lastRefresh.getTime() > twoMinutesMs;
      });

      if (!shouldRefresh) return;

      try {
        await postTodayRefresh();
        // After refresh fires, start polling
        this._startPolling();
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.code === 'rate_limited' &&
          err.details?.retryAfterSeconds
        ) {
          this.retryAfterSeconds = err.details.retryAfterSeconds as number;
          // Treat 429 as not an error
        } else {
          throw err;
        }
      }
    },

    _startPolling() {
      this.stop(); // Clear any existing polls
      let pollCount = 0; // Count polls to know when to switch phase
      let pollingPhase = '10s'; // '10s' or '60s'

      const schedulePoll = () => {
        if (document.visibilityState === 'hidden') {
          // Pause polling when hidden, but keep the timeout ready to check later
          this._pollHandle = setTimeout(schedulePoll, 1000);
          return;
        }

        // Execute the poll
        void getToday().then((data) => {
          this.payload = data;
        });

        pollCount += 1;

        // Switch to 60s polling after 3 polls (at t=30s)
        if (pollingPhase === '10s' && pollCount >= 3) {
          pollingPhase = '60s';
        }

        const interval = pollingPhase === '10s' ? 10_000 : 60_000;
        this._pollHandle = setTimeout(schedulePoll, interval);
      };

      // Start polling: first poll at 10 seconds
      this._pollHandle = setTimeout(schedulePoll, 10_000);

      // Listen for visibility changes
      const handleVisibilityChange = () => {
        // When visibility changes, the next timeout will check the state
      };

      this._visibilityHandler = handleVisibilityChange;
      document.addEventListener('visibilitychange', this._visibilityHandler);
    },

    stop() {
      if (this._pollHandle) {
        clearTimeout(this._pollHandle);
        this._pollHandle = null;
      }
      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }
    },
  },
});
