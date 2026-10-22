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
    /** The in-flight fetch for `loadedFor`, so a repeat call waits for it instead of returning early. */
    pending: null as Promise<void> | null,
  }),

  actions: {
    /** Signed in: GET /flags. Signed out: GET /flags/public (never both). A repeat call in the
     * same auth state is a no-op, so App.vue and the router guard can both call it. */
    load(): Promise<void> | undefined {
      const kind = useSessionStore().user ? 'auth' : 'public';
      if (this.loadedFor === kind) return this.pending ?? undefined;
      this.loadedFor = kind;
      const run = this.fetchFlags(kind);
      this.pending = run;
      return run;
    },

    async fetchFlags(kind: 'auth' | 'public') {
      try {
        const res = await apiFetch<FlagsResponse>(kind === 'auth' ? '/flags' : '/flags/public');
        // A body without `flags` must not leave the store undefined: every isOn() would throw.
        if (this.loadedFor === kind) this.flags = res.flags ?? {};
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
