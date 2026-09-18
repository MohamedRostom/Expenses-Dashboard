import { defineStore } from 'pinia';
import { apiFetch, ApiError } from '../api/client.js';

// Local/minimal shape — packages/contracts/src/me.ts will supersede this in a later task.
export interface User {
  id: string;
  email: string;
  defaultCurrency: string;
  theme: 'light' | 'dark' | 'system';
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: null as User | null,
  }),
  actions: {
    async load() {
      try {
        this.user = await apiFetch<User>('/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          this.user = null;
          return;
        }
        throw err;
      }
    },
    async logout() {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
      this.user = null;
    },
  },
});
