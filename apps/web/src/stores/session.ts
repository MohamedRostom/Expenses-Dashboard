import { defineStore } from 'pinia';
import { apiFetch, ApiError } from '../api/client.js';

// Local/minimal shape — packages/contracts/src/me.ts will supersede this in a later task.
export interface User {
  id: string;
  email: string;
  defaultCurrency: string;
  theme: 'light' | 'dark' | 'system';
  timeZone: string;
  onboardingCompletedAt?: string | null;
  /** From UserResponse; false until the address is confirmed (FR-001). */
  emailVerified?: boolean;
}

const CACHE_KEY = 'desk_cached_user';

/** C8: last-known /me response, so a cold start with no network can still render the app shell
 * instead of the router guard's rethrow leaving <RouterView> blank. Never treated as
 * authoritative — a stale cache just means the guard lets a screen render optimistically. */
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore — private browsing / storage blocked
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: null as User | null,
  }),
  actions: {
    async load() {
      try {
        // GET /me returns { user: {...} }, not the User object bare — LoginView/VerifyView/
        // OnboardingView all unwrap `.user` themselves; this used to assign the whole envelope
        // to `this.user`, so `session.user.onboardingCompletedAt` (and every other field) was
        // always undefined after a hard reload, looping an incomplete-onboarding user back to
        // /onboarding forever.
        const res = await apiFetch<{ user: User }>('/me');
        this.user = res.user;
        writeCachedUser(this.user);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          this.user = null;
          writeCachedUser(null);
          return;
        }
        // Network error (offline cold start): fall back to the last-known user rather than
        // rethrowing into the router guard, which would abort navigation and blank the app.
        const cached = readCachedUser();
        if (cached) {
          this.user = cached;
          return;
        }
        throw err;
      }
    },
    async logout() {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
      this.user = null;
      writeCachedUser(null);
    },
  },
});
