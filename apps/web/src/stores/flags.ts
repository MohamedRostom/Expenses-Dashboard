import { defineStore } from 'pinia';
import { apiFetch } from '../api/client.js';

export interface FlagsResponse {
  flags: Record<string, boolean>;
}

export const useFlagsStore = defineStore('flags', {
  state: () => ({
    flags: {} as Record<string, boolean>,
  }),

  actions: {
    async load() {
      try {
        const res = await apiFetch<FlagsResponse>('/flags');
        this.flags = res.flags;
      } catch {
        // On error, flags remain empty/false — routes check isOn() which returns false for missing keys
        this.flags = {};
      }
    },

    isOn(key: string): boolean {
      return this.flags[key] === true;
    },
  },
});
