import { defineStore } from 'pinia';
import { apiFetch } from '../api/client.js';
import { useSessionStore } from './session.js';

export interface FlagsResponse {
  flags: Record<string, boolean>;
}

export const useFlagsStore = defineStore('flags', {
  state: () => ({
    flags: {} as Record<string, boolean>,
    loadedFor: null as 'auth' | 'public' | null,
  }),

  actions: {
    /** Signed in: GET /flags. Signed out: GET /flags/public (never both). A repeat call in the
     * same auth state is a no-op, so App.vue and the router guard can both call it. */
    async load() {
      const kind = useSessionStore().user ? 'auth' : 'public';
      if (this.loadedFor === kind) return;
      this.loadedFor = kind;
      try {
        const res = await apiFetch<FlagsResponse>(kind === 'auth' ? '/flags' : '/flags/public');
        if (this.loadedFor === kind) this.flags = res.flags;
      } catch {
        this.loadedFor = null;
        // On error, flags remain empty/false — routes check isOn() which returns false for missing keys
        this.flags = {};
      }
    },

    isOn(key: string): boolean {
      return this.flags[key] === true;
    },
  },
});
